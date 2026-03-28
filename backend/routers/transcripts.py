import uuid, json, os
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from database import get_db, AsyncSessionLocal
from routers.auth import current_user
from models.user import User
from models.call import Call, CallStatus, SentimentType
from models.transcript import Transcript
from models.audit import AuditResult
from models.violation import Violation, Severity
from models.agent import Agent
from services.ai_auditor import audit_transcript, enrich_turns_with_expressions
from services.scoring import refresh_agent_stats
from websocket_manager import manager
from config import settings
import datetime

router = APIRouter(prefix="/transcripts", tags=["transcripts"])

class TurnIn(BaseModel):
	role:     str
	text:     str
	ts_start: float = 0.0
	ts_end:   float = 0.0

class TranscriptIn(BaseModel):
	call_ref:     str
	agent_id:     str
	channel:      str = "phone"
	duration_sec: int = 0
	turns:        list[TurnIn]

async def _persist_audit(call_id: str, agent_id: str, turns: list[dict]):
	"""Background task: uses its own DB session to avoid closed-session errors."""
	async with AsyncSessionLocal() as db:
		try:
			call_uuid = uuid.UUID(call_id)
			call = await db.get(Call, call_uuid)
			if not call:
				return

			# ── If the agent never spoke, produce an automatic hard-fail score
			# without calling the LLM (which tends to give generous scores for
			# near-empty transcripts).
			agent_turns = [t for t in turns if t.get("role") == "agent"]
			if len(agent_turns) == 0:
				ai = {
					"overall_score": 4.0,
					"dimensions": {
						"empathy":         0.0,
						"compliance":       0.0,
						"resolution":       0.0,
						"professionalism":  1.0,
						"communication":    0.0,
					},
					"sentiment": "negative",
					"violations": [{
						"type":        "No Agent Response",
						"severity":    "Critical",
						"turn_index":  0,
						"description": "Agent did not respond to the customer at all. "
									   "The call ended without the agent speaking a single word.",
					}],
					"suggestions": [{
						"turn_index":  0,
						"original":    "",
						"suggestion":  "Greet the customer, acknowledge their issue, and work toward a resolution.",
						"reason":      "The agent failed to respond entirely — every customer deserves a response.",
					}],
					"summary": (
						"The agent did not respond to the customer at all. "
						"The customer presented their issue but received zero assistance. "
						"This is a critical failure requiring immediate coaching and supervisor review."
					),
				}
			else:
				ai = await audit_transcript(turns)
			dims = ai.get("dimensions", {})
			result = AuditResult(
				call_id=call.id,
				overall_score=    ai.get("overall_score", 0),
				empathy_score=    dims.get("empathy", 0),
				compliance_score= dims.get("compliance", 0),
				resolution_score= dims.get("resolution", 0),
				professionalism=  dims.get("professionalism", 0),
				communication=    dims.get("communication", 0),
				suggestions=      ai.get("suggestions", []),
				raw_ai_response=  ai,
			)
			db.add(result)
			for v in ai.get("violations", []):
				db.add(Violation(
					call_id=call.id,
					agent_id=call.agent_id,
					violation_type=v.get("type"),
					severity=Severity(v.get("severity", "Medium")),
					turn_index=v.get("turn_index"),
					description=v.get("description"),
				))
			call.status    = CallStatus.audited
			call.sentiment = SentimentType(ai.get("sentiment", "neutral"))
			
			# Enrich transcript turns with emotion/expression analysis
			enriched_turns = await enrich_turns_with_expressions(turns)
			transcript = await db.scalar(select(Transcript).where(Transcript.call_id == call.id))
			if transcript:
				transcript.turns = enriched_turns
			
			await db.commit()
			await refresh_agent_stats(agent_id, db)
			await manager.broadcast_all({
				"event":      "audit_complete",
				"call_ref":   call.call_ref,
				"score":      ai.get("overall_score"),
				"violations": len(ai.get("violations", [])),
			})
		except Exception as e:
			call = await db.get(Call, uuid.UUID(call_id))
			if call:
				call.status = CallStatus.failed
				await db.commit()
			raise e

@router.post("/upload", status_code=202)
async def upload_recording(
	bg:            BackgroundTasks,
	file:          UploadFile   = File(...),
	call_ref:      str          = Form(...),
	first_speaker: str          = Form("agent"),  # "agent" or "customer"
	db:            AsyncSession = Depends(get_db),
	user:          User         = Depends(current_user),
):
	"""Agent uploads an audio/video recording; AssemblyAI transcribes with speaker diarization and queues audit."""
	import asyncio
	import assemblyai as aai

	# Resolve the agent profile for the authenticated user
	agent = await db.scalar(select(Agent).where(Agent.user_id == user.id))
	if not agent:
		raise HTTPException(403, "No agent profile found for this account")

	# Read & validate file size
	contents = await file.read()
	max_bytes = settings.MAX_AUDIO_MB * 1024 * 1024
	if len(contents) > max_bytes:
		raise HTTPException(413, f"File exceeds {settings.MAX_AUDIO_MB} MB limit")

	# Persist file to disk
	os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
	ext = os.path.splitext(file.filename or "recording.mp3")[1].lower() or ".mp3"
	saved_name = f"{uuid.uuid4()}{ext}"
	saved_path = os.path.join(settings.UPLOAD_DIR, saved_name)
	with open(saved_path, "wb") as fh:
		fh.write(contents)

	# Transcribe with AssemblyAI speaker diarization
	transcript_error = None
	turns: list[dict] = []
	raw_text_parts: list[str] = []

	if not settings.ASSEMBLYAI_API_KEY:
		transcript_error = "ASSEMBLYAI_API_KEY not configured"
	else:
		try:
			aai.settings.api_key = settings.ASSEMBLYAI_API_KEY
			config = aai.TranscriptionConfig(
				speaker_labels=True,
				speech_models=["universal-2"],
			)
			transcriber = aai.Transcriber()
			# SDK is blocking — run in thread pool to avoid blocking the event loop
			result = await asyncio.to_thread(transcriber.transcribe, saved_path, config)

			if result.status == aai.TranscriptStatus.error:
				raise RuntimeError(result.error)

			# Map AssemblyAI speaker labels ("A", "B", …) to agent / customer roles.
			# The first speaker heard is assigned the role chosen by the agent uploader.
			speaker_map: dict[str, str] = {}
			for utt in (result.utterances or []):
				spk = utt.speaker
				if spk not in speaker_map:
					if not speaker_map:
						# First speaker heard
						speaker_map[spk] = first_speaker if first_speaker in ("agent", "customer") else "agent"
					else:
						# All subsequent new speakers get the opposite role
						assigned = set(speaker_map.values())
						speaker_map[spk] = "customer" if "agent" in assigned else "agent"
				turns.append({
					"role":     speaker_map[spk],
					"text":     utt.text,
					"ts_start": (utt.start or 0) / 1000.0,
					"ts_end":   (utt.end   or 0) / 1000.0,
				})
				raw_text_parts.append(f"{speaker_map[spk]}: {utt.text}")

			if not turns:
				# Fallback: no utterances returned — use plain transcript text
				plain = result.text or "[empty transcription]"
				turns = [{"role": "agent", "text": plain, "ts_start": 0.0, "ts_end": 0.0}]
				raw_text_parts = [plain]
			else:
				# Log timestamps for debugging
				print(f"[DEBUG] AssemblyAI Timestamps for call {call_ref}:")
				for i, turn in enumerate(turns):
					print(f"  Turn {i+1} ({turn['role']}): {turn['ts_start']:.1f}s-{turn['ts_end']:.1f}s | {turn['text'][:50]}")
				
				# Auto-detect and fix speaker roles if they're reversed
				# Strategy: Check patterns in the turns to detect role reversal
				agent_indicators = 0  # phrases that indicate agent role
				customer_indicators = 0  # phrases that indicate customer role
				
				for turn in turns:
					text_lower = turn["text"].lower()
					
					# Customer indicators: they're calling with a problem
					if any(x in text_lower for x in ["i bought", "i have", "i want", "please", "can you", "could you", "my order", "problem", "issue", "complaint"]):
						customer_indicators += 1
					
					# Agent indicators: they're helping/responding
					elif any(x in text_lower for x in ["order id", "eligible for", "replacement", "sorry", "apologize", "refund", "appreciate", "thank you for calling", "customer support"]):
						agent_indicators += 1
				
				# If customer indicators significantly outnumber agent indicators, roles are likely swapped
				needs_swap = customer_indicators > max(agent_indicators, 2)  # at least 2 agent indicators to avoid swap
				
				if needs_swap and len(turns) > 2:
					print(f"[DEBUG] Detected reversed roles (customer patterns: {customer_indicators}, agent patterns: {agent_indicators}). Swapping all roles...")
					for turn in turns:
						turn["role"] = "customer" if turn["role"] == "agent" else "agent"
					print("[DEBUG] ✅ Roles successfully swapped")
				else:
					print(f"[DEBUG] Role validation: customer patterns={customer_indicators}, agent patterns={agent_indicators}, swap={needs_swap}")

		except Exception as exc:
			transcript_error = str(exc)
			print(f"[ERROR] Transcription failed: {exc}")
			# Graceful degradation: store a placeholder turn so the call record is usable
			turns = [{"role": "agent", "text": f"[Transcription unavailable: {exc}]", "ts_start": 0.0, "ts_end": 0.0}]
			raw_text_parts = [turns[0]["text"]]

	if not turns:  # ASSEMBLYAI_API_KEY missing branch
		turns = [{"role": "agent", "text": f"[{transcript_error}]", "ts_start": 0.0, "ts_end": 0.0}]
		raw_text_parts = [turns[0]["text"]]

	# Create Call record
	call = Call(
		call_ref=call_ref,
		agent_id=agent.id,
		channel="upload",
		status=CallStatus.processing,
		started_at=datetime.datetime.utcnow(),
		audio_path=saved_name,
	)
	db.add(call)
	await db.flush()

	transcript_row = Transcript(
		call_id=call.id,
		turns=turns,
		raw_text="\n".join(raw_text_parts),
	)
	db.add(transcript_row)
	await db.commit()

	# Queue AI audit as background task
	bg.add_task(_persist_audit, str(call.id), str(agent.id), turns)

	return {
		"message": "Recording uploaded" + (" and diarised transcription queued for audit" if not transcript_error else f" but transcription failed: {transcript_error}"),
		"call_id":  str(call.id),
		"call_ref": call_ref,
		"transcribed": transcript_error is None,
		"turns": len(turns),
	}

@router.post("/{call_id}/audio", status_code=200)
async def attach_call_audio(
	call_id: str,
	file:    UploadFile   = File(...),
	db:      AsyncSession = Depends(get_db),
	_:       User         = Depends(current_user),
):
	"""Attach a recorded audio blob to an existing call."""
	try:
		call_uuid = uuid.UUID(call_id)
	except ValueError:
		raise HTTPException(400, "Invalid call_id")
	call = await db.get(Call, call_uuid)
	if not call:
		raise HTTPException(404, "Call not found")

	contents = await file.read()
	os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
	ext = os.path.splitext(file.filename or "recording.webm")[1].lower() or ".webm"
	saved_name = f"{uuid.uuid4()}{ext}"
	saved_path = os.path.join(settings.UPLOAD_DIR, saved_name)
	with open(saved_path, "wb") as fh:
		fh.write(contents)

	call.audio_path = saved_name
	await db.commit()
	return {"audio_filename": saved_name}

@router.post("/ingest", status_code=202)
async def ingest_transcript(body: TranscriptIn, bg: BackgroundTasks,
							db: AsyncSession = Depends(get_db),
							_: User = Depends(current_user)):
	call = await db.scalar(select(Call).where(Call.call_ref == body.call_ref))
	if not call:
		call = Call(call_ref=body.call_ref, agent_id=body.agent_id,
					channel=body.channel, duration_sec=body.duration_sec,
					status=CallStatus.processing,
					started_at=datetime.datetime.utcnow())
		db.add(call)
		await db.flush()
	turns = [t.dict() for t in body.turns]
	transcript = Transcript(call_id=call.id, turns=turns,
							raw_text="\n".join(f"{t['role']}: {t['text']}" for t in turns))
	db.add(transcript)
	await db.commit()
	bg.add_task(_persist_audit, str(call.id), str(call.agent_id), turns)
	return {"message": "Transcript ingested, audit queued", "call_id": str(call.id)}

@router.get("/")
async def list_transcripts(
	agent_id: str | None = None,
	flagged:  bool | None = None,
	page:     int = 1,
	limit:    int = 20,
	db: AsyncSession = Depends(get_db),
	_: User = Depends(current_user)
):
	q = (select(Call, AuditResult)
		 .outerjoin(AuditResult, AuditResult.call_id == Call.id)
		 .order_by(desc(Call.created_at)))
	if agent_id:
		q = q.where(Call.agent_id == agent_id)
	if flagged is True:
		q = q.where(AuditResult.overall_score < 70)
	q = q.offset((page-1)*limit).limit(limit)
	rows = await db.execute(q)
	return [{"call_id": str(c.id), "call_ref": c.call_ref, "channel": c.channel,
			 "status": c.status, "duration": c.duration_sec,
			 "score": a.overall_score if a else None,
			 "sentiment": c.sentiment, "created_at": c.created_at.isoformat()}
			for c, a in rows]

@router.get("/{call_id}")
async def get_transcript(call_id: str, db: AsyncSession = Depends(get_db),
						 _: User = Depends(current_user)):
	try:
		call_uuid = uuid.UUID(call_id)
	except ValueError:
		raise HTTPException(400, "Invalid call_id")
	call = await db.get(Call, call_uuid)
	if not call:
		raise HTTPException(404, "Call not found")
	transcript = await db.scalar(select(Transcript).where(Transcript.call_id == call_uuid))
	audit      = await db.scalar(select(AuditResult).where(AuditResult.call_id == call_uuid))
	viols      = await db.execute(select(Violation).where(Violation.call_id == call_uuid))
	return {
		"call": {"ref": call.call_ref, "channel": call.channel,
				 "duration": call.duration_sec, "status": call.status,
				 "sentiment": call.sentiment, "created_at": call.created_at.isoformat(),
				 "audio_filename": call.audio_path},
		"transcript": {"turns": transcript.turns if transcript else []},
		"audit": {
			"overall_score": audit.overall_score,
			"dimensions": {
				"empathy":         audit.empathy_score,
				"compliance":      audit.compliance_score,
				"resolution":      audit.resolution_score,
				"professionalism": audit.professionalism,
				"communication":   audit.communication,
			},
			"suggestions": audit.suggestions,
		} if audit else None,
		"violations": [
			{"id": str(v.id), "type": v.violation_type, "severity": v.severity,
			 "turn_index": v.turn_index, "description": v.description,
			 "status": v.status}
			for v, in viols
		],
	}

@router.patch("/violations/{violation_id}/resolve", status_code=200)
async def resolve_violation(violation_id: str, db: AsyncSession = Depends(get_db),
							 _: User = Depends(current_user)):
	from models.violation import ViolationStatus
	try:
		viol_uuid = uuid.UUID(violation_id)
	except ValueError:
		raise HTTPException(400, "Invalid violation_id")
	v = await db.get(Violation, viol_uuid)
	if not v:
		raise HTTPException(404)
	v.status      = ViolationStatus.resolved
	v.resolved_at = datetime.datetime.utcnow()
	await db.commit()
	return {"status": "resolved"}
