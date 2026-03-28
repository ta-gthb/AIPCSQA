import uuid, json, os, asyncio
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
from openai import AsyncOpenAI
import datetime

router = APIRouter(prefix="/transcripts", tags=["transcripts"])

# Initialize LLM client
llm_client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY, base_url=settings.OPENAI_BASE_URL)

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

async def _verify_and_correct_speaker_roles(turns: list[dict]) -> list[dict]:
	"""
	Use LLM to analyze each turn's content and determine if it's from a customer or agent.
	Returns corrected turns with proper roles assigned.
	"""
	if not turns or len(turns) < 2:
		return turns
	
	# Build context of the conversation
	transcript_context = "\n".join([f"Turn {i+1}: {t['text'][:100]}" for i, t in enumerate(turns[:10])])
	
	# Ask LLM to analyze each turn
	prompt = f"""You are a customer support conversation analyzer. Analyze this call transcript and determine for each turn whether the speaker is a CUSTOMER or an AGENT.

CONTEXT: This is a customer support call where a customer called Flipkart about a product issue.

Call transcript (first 10 turns):
{transcript_context}

For the FULL transcript below, respond with a JSON array indicating the correct role for each turn.
Rules:
- CUSTOMER: Calling about their issue, asking for help, providing their information (order ID, etc.), expressing frustration
- AGENT: Providing customer support, acknowledging the issue, explaining policies, offering solutions, saying things like "thank you for calling"

Full transcript:
{json.dumps([{{"text": t["text"][:150], "current_role": t["role"]}} for t in turns])}

Respond ONLY with a valid JSON array of roles (no other text):
["agent", "customer", "agent", "customer", ...]

Make the roles lowercase: "agent" or "customer"."""

	try:
		response = await llm_client.chat.completions.create(
			model="llama-3.3-70b-versatile",
			max_tokens=500,
			temperature=0.2,
			messages=[
				{"role": "system", "content": "You are an expert at analyzing customer support conversations. Respond with ONLY valid JSON array."},
				{"role": "user", "content": prompt}
			]
		)
		
		raw_response = response.choices[0].message.content.strip()
		print(f"[DEBUG] LLM Response: {raw_response[:100]}...")
		
		# Parse JSON response
		try:
			detected_roles = json.loads(raw_response)
		except json.JSONDecodeError:
			print(f"[ERROR] Could not parse JSON from LLM: {raw_response[:200]}")
			return turns
		
		# Handle case where LLM returns a dict with "roles" key
		if isinstance(detected_roles, dict):
			detected_roles = detected_roles.get("roles", [])
			if not detected_roles:
				print("[ERROR] LLM returned dict but no 'roles' key found")
				return turns
		
		if not isinstance(detected_roles, list):
			print(f"[ERROR] LLM response is not a list: {type(detected_roles)}")
			return turns
		
		if len(detected_roles) != len(turns):
			print(f"[WARNING] LLM returned {len(detected_roles)} roles but transcript has {len(turns)} turns. Using original roles.")
			return turns
		
		# Update turns with detected roles
		corrected_turns = []
		role_changes = 0
		for i, turn in enumerate(turns):
			detected_role = detected_roles[i]
			
			# Ensure it's a string and normalize to lowercase
			if not isinstance(detected_role, str):
				print(f"[WARNING] Role at index {i} is not a string: {detected_role}")
				detected_role = turn["role"]
			else:
				detected_role = detected_role.lower().strip()
				
			if detected_role not in ("agent", "customer"):
				print(f"[WARNING] Invalid role '{detected_role}' at turn {i+1}, using original")
				detected_role = turn["role"]
			
			new_turn = turn.copy()
			if new_turn["role"] != detected_role:
				role_changes += 1
				print(f"  [ROLE CHANGE] Turn {i+1}: {turn['role']} → {detected_role} | {turn['text'][:60]}")
			
			new_turn["role"] = detected_role
			corrected_turns.append(new_turn)
		
		print(f"[DEBUG] LLM detected {role_changes} role corrections out of {len(turns)} turns")
		return corrected_turns
		
	except Exception as e:
		print(f"[ERROR] LLM role verification failed: {e}")
		import traceback
		traceback.print_exc()
		print("[DEBUG] Falling back to original roles")
		return turns

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
				
				# Use LLM to intelligently detect correct speaker roles based on content
				print("[DEBUG] Using LLM to verify and correct speaker roles...")
				corrected_turns = await _verify_and_correct_speaker_roles(turns)
				turns = corrected_turns
				print("[DEBUG] ✅ Speaker roles verified by AI")

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
