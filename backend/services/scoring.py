from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from models.call import Call, CallStatus
from models.audit import AuditResult
from models.violation import Violation
from models.agent import Agent
import datetime

async def refresh_agent_stats(agent_id: str, db: AsyncSession):
	"""Recalculate and persist aggregate stats for one agent."""
	res = await db.execute(
		select(
			func.count(Call.id).label("total"),
			func.avg(AuditResult.overall_score).label("avg_score"),
			func.avg(Call.duration_sec).label("avg_dur"),
		)
		.join(AuditResult, AuditResult.call_id == Call.id)
		.where(Call.agent_id == agent_id, Call.status == CallStatus.audited)
	)
	row = res.one()

	viol_count = await db.scalar(
		select(func.count(Violation.id)).where(Violation.agent_id == agent_id)
	)

	agent = await db.get(Agent, agent_id)
	if agent:
		agent.total_calls    = row.total or 0
		agent.avg_score      = round(float(row.avg_score or 0), 1)
		agent.avg_handle_time = int(row.avg_dur or 0)
		agent.violations     = viol_count or 0
		await db.commit()

async def dashboard_kpis(db: AsyncSession, days: int = 7) -> dict:
	since = datetime.datetime.utcnow() - datetime.timedelta(days=days)

	total_calls = await db.scalar(
		select(func.count(Call.id)).where(Call.created_at >= since)
	)
	avg_score = await db.scalar(
		select(func.avg(AuditResult.overall_score))
		.join(Call, Call.id == AuditResult.call_id)
		.where(Call.created_at >= since)
	)
	violations = await db.scalar(
		select(func.count(Violation.id))
		.join(Call, Call.id == Violation.call_id)
		.where(Call.created_at >= since)
	)
	resolved = await db.scalar(
		select(func.count(AuditResult.id))
		.join(Call, Call.id == AuditResult.call_id)
		.where(Call.created_at >= since, AuditResult.resolution_score >= 7)
	)
	resolution_rate = round((resolved / total_calls * 100), 1) if total_calls else 0

	return {
		"interactions_audited": total_calls or 0,
		"avg_quality_score":    round(float(avg_score or 0), 1),
		"compliance_violations": violations or 0,
		"resolution_rate":      resolution_rate,
	}

async def score_trend(db: AsyncSession, days: int = 30) -> list[dict]:
	"""Daily avg score for trend chart."""
	since = datetime.datetime.utcnow() - datetime.timedelta(days=days)
	rows = await db.execute(
		select(
			func.date_trunc("day", Call.created_at).label("day"),
			func.avg(AuditResult.overall_score).label("avg")
		)
		.join(AuditResult, AuditResult.call_id == Call.id)
		.where(Call.created_at >= since)
		.group_by("day")
		.order_by("day")
	)
	return [{"date": str(r.day.date()), "score": round(float(r.avg), 1)} for r in rows]
