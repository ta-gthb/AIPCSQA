from sqlalchemy import update, delete
import hashlib, secrets
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, or_
from database import get_db
from routers.auth import current_user
from models.user import User
from models.agent import Agent
from models.audit import AuditResult
from models.call import Call
from models.violation import Violation
import datetime

router = APIRouter(prefix="/agents", tags=["agents"])

# Reset agent password (supervisor only)
@router.post("/{agent_id}/reset-password")
async def reset_agent_password(agent_id: str, new_password: str, db: AsyncSession = Depends(get_db), user: User = Depends(current_user)):
	import uuid as uuid_module
	if user.role != "supervisor":
		raise HTTPException(403, "Only supervisors can reset agent passwords.")
	try:
		agent_uuid = uuid_module.UUID(agent_id)
	except ValueError:
		raise HTTPException(400, "Invalid agent ID format")
	agent = await db.get(Agent, agent_uuid)
	if not agent:
		raise HTTPException(404, "Agent not found")
	# Update password for linked user
	salt = secrets.token_hex(32)
	password_hash = f"{salt}:{hashlib.sha256((salt + new_password).encode()).hexdigest()}"
	await db.execute(update(User).where(User.id == agent.user_id).values(password_hash=password_hash))
	await db.commit()
	return {"detail": "Password reset successfully."}

# Delete agent (supervisor only)
@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(current_user)):
	import uuid as uuid_module
	if user.role != "supervisor":
		raise HTTPException(403, "Only supervisors can delete agents.")
	try:
		agent_uuid = uuid_module.UUID(agent_id)
	except ValueError:
		raise HTTPException(400, "Invalid agent ID format")
	agent = await db.get(Agent, agent_uuid)
	if not agent:
		raise HTTPException(404, "Agent not found")
	user_uuid = agent.user_id
	# Cascade-delete child records referencing this agent
	await db.execute(delete(Violation).where(Violation.agent_id == agent_uuid))
	# Delete audit results and transcripts via calls
	from models.transcript import Transcript
	from models.audit import AuditResult
	from models.report import Report
	call_rows = await db.execute(select(Call.id).where(Call.agent_id == agent_uuid))
	call_ids = [r[0] for r in call_rows]
	if call_ids:
		await db.execute(delete(AuditResult).where(AuditResult.call_id.in_(call_ids)))
		await db.execute(delete(Transcript).where(Transcript.call_id.in_(call_ids)))
		await db.execute(delete(Call).where(Call.id.in_(call_ids)))
	# Delete reports created by (or for) this user — FK reports.created_by → users.id
	await db.execute(delete(Report).where(Report.created_by == user_uuid))
	await db.execute(delete(Agent).where(Agent.id == agent_uuid))
	await db.execute(delete(User).where(User.id == user_uuid))
	await db.commit()
	return {"detail": "Agent deleted successfully."}

from models.message import AgentMessage, MessageStatus
import uuid as uuid_module

@router.post("/contact-supervisor")
async def contact_supervisor(
	subject: str,
	body: str,
	db: AsyncSession = Depends(get_db),
	user: User = Depends(current_user)
):
	if user.role != "agent":
		raise HTTPException(403, "Only agents can contact supervisors")
	# get agent_id string for reference
	result = await db.execute(select(Agent).where(Agent.user_id == user.id))
	agent = result.scalars().first()
	msg = AgentMessage(
		agent_id=user.id,
		agent_name=user.name,
		agent_ref=agent.agent_id if agent else None,
		subject=subject,
		body=body
	)
	db.add(msg)
	await db.commit()
	return {"detail": "Message sent to supervisor"}

@router.get("/supervisor-messages")
async def supervisor_messages(
	db: AsyncSession = Depends(get_db),
	user: User = Depends(current_user)
):
	if user.role != "supervisor":
		raise HTTPException(403, "Only supervisors can view messages")
	rows = await db.execute(
		select(AgentMessage).order_by(AgentMessage.created_at.desc()).limit(50)
	)
	msgs = rows.scalars().all()
	return [{
		"id": str(m.id),
		"agent_name": m.agent_name,
		"agent_ref": m.agent_ref,
		"subject": m.subject,
		"body": m.body,
		"status": m.status,
		"created_at": m.created_at.isoformat(),
		"reply": m.reply,
	} for m in msgs]

@router.patch("/supervisor-messages/{msg_id}/read")
async def mark_message_read(
	msg_id: str,
	db: AsyncSession = Depends(get_db),
	user: User = Depends(current_user)
):
	if user.role != "supervisor":
		raise HTTPException(403, "Only supervisors can update messages")
	msg = await db.get(AgentMessage, uuid_module.UUID(msg_id))
	if not msg:
		raise HTTPException(404, "Message not found")
	msg.status = MessageStatus.read
	await db.commit()
	return {"detail": "Marked as read"}

@router.get("/me")
async def my_agent_profile(db: AsyncSession = Depends(get_db), user: User = Depends(current_user)):
	result = await db.execute(select(Agent).where(Agent.user_id == user.id))
	agent = result.scalars().first()
	if not agent:
		raise HTTPException(404, "Agent profile not found")
	return {
		"id": str(agent.id),
		"agent_id": agent.agent_id,
		"user_id": str(user.id),
		"name": user.name,
		"email": user.email,
		"team": agent.team,
		"role": user.role,
		"avg_score": agent.avg_score,
		"total_calls": agent.total_calls,
		"violations": agent.violations,
		"avg_handle_time": agent.avg_handle_time,
		"is_active": user.is_active,
	}

@router.get("/")
async def list_agents(
	search: str | None = None,
	team:   str | None = None,
	sort:   str = Query("score", regex="^(score|calls|violations|name)$"),
	page:   int = 1,
	limit:  int = 20,
	db: AsyncSession = Depends(get_db),
	_: User = Depends(current_user)
):
	q = select(Agent, User.name, User.email).join(User, User.id == Agent.user_id)
	if search:
		q = q.where(or_(User.name.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
	if team:
		q = q.where(Agent.team == team)
	order = {"score": desc(Agent.avg_score), "calls": desc(Agent.total_calls),
			 "violations": desc(Agent.violations), "name": User.name}.get(sort, desc(Agent.avg_score))
	q = q.order_by(order).offset((page-1)*limit).limit(limit)
	rows = await db.execute(q)
	return [{
		"id": str(a.id),
		"agent_id": a.agent_id,
		"name": name,
		"email": email,
		"team": a.team,
		"avg_score": a.avg_score,
		"total_calls": a.total_calls,
		"violations": a.violations,
		"avg_handle_time": a.avg_handle_time
	} for a, name, email in rows]

@router.get("/{agent_id}")
async def agent_detail(agent_id: str, db: AsyncSession = Depends(get_db),
					   _: User = Depends(current_user)):
	agent = await db.get(Agent, agent_id)
	if not agent:
		raise HTTPException(404, "Agent not found")
	calls = await db.execute(
		select(Call, AuditResult)
		.outerjoin(AuditResult, AuditResult.call_id == Call.id)
		.where(Call.agent_id == agent_id)
		.order_by(desc(Call.created_at)).limit(5)
	)
	recent = [{"call_ref": c.call_ref, "score": a.overall_score if a else None,
			   "status": c.status, "date": c.created_at.isoformat()}
			  for c, a in calls]
	since = datetime.datetime.utcnow() - datetime.timedelta(days=30)
	trend_rows = await db.execute(
		select(AuditResult.overall_score, Call.created_at)
		.join(Call, Call.id == AuditResult.call_id)
		.where(Call.agent_id == agent_id, Call.created_at >= since)
		.order_by(Call.created_at)
	)
	trend = [{"score": r[0], "date": r[1].isoformat()} for r in trend_rows]
	return {"agent_id": agent_id, "avg_score": agent.avg_score,
			"total_calls": agent.total_calls, "violations": agent.violations,
			"avg_handle_time": agent.avg_handle_time, "recent_calls": recent,
			"score_trend": trend}

@router.get("/{agent_id}/violations")
async def agent_violations(agent_id: str, db: AsyncSession = Depends(get_db),
							_: User = Depends(current_user)):
	rows = await db.execute(
		select(Violation).where(Violation.agent_id == agent_id)
		.order_by(desc(Violation.detected_at)).limit(50)
	)
	return [{"id": str(v.id), "type": v.violation_type, "severity": v.severity,
			 "status": v.status, "detected_at": v.detected_at.isoformat()}
			for v, in rows]
