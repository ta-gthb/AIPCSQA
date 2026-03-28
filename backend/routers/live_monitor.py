from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from database import get_db
from routers.auth import current_user
from models.user import User
from models.call import Call, CallStatus
from models.audit import AuditResult
from websocket_manager import manager
from services.ai_auditor import whisper_suggestion
from pydantic import BaseModel

router = APIRouter(prefix="/live", tags=["live-monitor"])

class WhisperRequest(BaseModel):
	call_id:      str
	recent_turns: list[dict]
	current_turn: dict

class QuickResponseRequest(BaseModel):
	recent_turns: list[dict]  # Conversation history
	current_customer_message: str  # Latest customer message

@router.get("/active-calls")
async def active_calls(db: AsyncSession = Depends(get_db),
					   _: User = Depends(current_user)):
	rows = await db.execute(
		select(Call, AuditResult)
		.outerjoin(AuditResult, AuditResult.call_id == Call.id)
		.where(Call.status == CallStatus.live)
		.order_by(desc(Call.started_at))
	)
	return [{"call_id": str(c.id), "call_ref": c.call_ref,
			 "channel": c.channel, "duration_sec": c.duration_sec,
			 "score": a.overall_score if a else None,
			 "sentiment": c.sentiment}
			for c, a in rows]

@router.post("/whisper")
async def whisper(body: WhisperRequest,
				  _: User = Depends(current_user)):
	suggestion = await whisper_suggestion(body.recent_turns, body.current_turn)
	await manager.broadcast(body.call_id, {
		"event":      "whisper",
		"call_id":    body.call_id,
		"suggestion": suggestion,
	})
	return {"suggestion": suggestion}

@router.post("/quick-responses")
async def generate_quick_responses(body: QuickResponseRequest,
								   _: User = Depends(current_user)):
	"""Generate AI-powered quick response suggestions based on customer message."""
	try:
		from services.ai_auditor import get_quick_response_suggestions
		suggestions = await get_quick_response_suggestions(
			body.recent_turns,
			body.current_customer_message
		)
		return {"suggestions": suggestions}
	except Exception as e:
		# Fallback to default suggestions on error
		return {
			"suggestions": [
				"Thank you for providing that information. Let me help you with that.",
				"I understand your concern. I'm here to assist you.",
				"Could you provide me with more details so I can better help?",
				"I appreciate your patience. Let me look into this for you.",
				"Is there anything else I can assist you with?"
			]
		}

@router.websocket("/ws/{call_id}")
async def ws_endpoint(call_id: str, websocket: WebSocket):
	"""
	Supervisors connect here to receive real-time audit
	events for a call. Use call_id = 'all' for all calls.
	"""
	await manager.connect(call_id, websocket)
	try:
		while True:
			data = await websocket.receive_text()
			await websocket.send_text(f"ack:{data}")
	except WebSocketDisconnect:
		manager.disconnect(call_id, websocket)
