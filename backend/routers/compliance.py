from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from database import get_db
from routers.auth import current_user
from models.user import User
from models.violation import Violation, Severity, ViolationStatus
from models.call import Call
from models.agent import Agent
import datetime

router = APIRouter(prefix="/compliance", tags=["compliance"])

@router.get("/overview")
async def compliance_overview(days: int = Query(30, ge=1, le=365),
							  db: AsyncSession = Depends(get_db),
							  _: User = Depends(current_user)):
	since = datetime.datetime.utcnow() - datetime.timedelta(days=days)
	total_calls = await db.scalar(
		select(func.count(Call.id)).where(Call.created_at >= since)
	)
	total_viols = await db.scalar(
		select(func.count(Violation.id))
		.join(Call, Call.id == Violation.call_id)
		.where(Call.created_at >= since)
	)
	critical = await db.scalar(
		select(func.count(Violation.id))
		.join(Call, Call.id == Violation.call_id)
		.where(Call.created_at >= since, Violation.severity == Severity.critical)
	)
	bad_calls = await db.scalar(
		select(func.count(func.distinct(Violation.call_id)))
		.join(Call, Call.id == Violation.call_id)
		.where(Call.created_at >= since, Violation.severity == Severity.critical)
	)
	score = round(((total_calls - bad_calls) / total_calls * 100), 1) if total_calls else 100.0
	return {"compliance_score": score, "total_violations": total_viols,
			"critical_today": critical, "period_days": days}

@router.get("/violation-breakdown")
async def violation_breakdown(days: int = 30,
							   db: AsyncSession = Depends(get_db),
							   _: User = Depends(current_user)):
	since = datetime.datetime.utcnow() - datetime.timedelta(days=days)
	rows = await db.execute(
		select(Violation.violation_type, func.count(Violation.id).label("cnt"))
		.join(Call, Call.id == Violation.call_id)
		.where(Call.created_at >= since)
		.group_by(Violation.violation_type)
		.order_by(desc("cnt"))
	)
	data  = [(r.violation_type, r.cnt) for r in rows]
	total = sum(c for _, c in data) or 1
	return [{"type": t, "count": c, "pct": round(c/total*100)} for t, c in data]

@router.get("/alerts")
async def critical_alerts(status: str | None = None,
						  db: AsyncSession = Depends(get_db),
						  _: User = Depends(current_user)):
	q = (select(Violation, Call.call_ref, User.name)
		 .join(Call, Call.id == Violation.call_id)
		 .join(Agent, Agent.id == Violation.agent_id)
		 .join(User, User.id == Agent.user_id)
		 .where(Violation.severity.in_([Severity.critical, Severity.high]))
		 .order_by(desc(Violation.detected_at)).limit(50))
	if status:
		q = q.where(Violation.status == status)
	rows = await db.execute(q)
	return [{"id": str(v.id), "call_ref": ref, "agent": name,
			 "type": v.violation_type, "severity": v.severity,
			 "status": v.status, "detected_at": v.detected_at.isoformat()}
			for v, ref, name in rows]
