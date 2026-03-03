from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from database import get_db
from routers.auth import current_user
from models.user import User
from models.agent import Agent
from models.call import Call, CallStatus
from models.audit import AuditResult
from models.violation import Violation
from services.scoring import dashboard_kpis, score_trend
import datetime

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get("/kpis")
async def get_kpis(days: int = Query(7, ge=1, le=365),
				   db: AsyncSession = Depends(get_db),
				   _: User = Depends(current_user)):
	return await dashboard_kpis(db, days)

@router.get("/score-trend")
async def get_score_trend(days: int = Query(30, ge=7, le=365),
						  db: AsyncSession = Depends(get_db),
						  _: User = Depends(current_user)):
	return await score_trend(db, days)

@router.get("/agent-leaderboard")
async def leaderboard(limit: int = Query(10, le=50),
					  db: AsyncSession = Depends(get_db),
					  _: User = Depends(current_user)):
	rows = await db.execute(
		select(Agent, User.name)
		.join(User, User.id == Agent.user_id)
		.order_by(desc(Agent.avg_score))
		.limit(limit)
	)
	return [
		{"rank": i+1, "name": name, "score": a.avg_score,
		 "calls": a.total_calls, "violations": a.violations,
		 "agent_id": str(a.id)}
		for i, (a, name) in enumerate(rows)
	]

@router.get("/score-distribution")
async def score_distribution(db: AsyncSession = Depends(get_db),
							  _: User = Depends(current_user)):
	since = datetime.datetime.utcnow() - datetime.timedelta(days=30)
	rows = await db.execute(
		select(AuditResult.overall_score)
		.join(Call, Call.id == AuditResult.call_id)
		.where(Call.created_at >= since)
	)
	scores = [r[0] for r in rows]
	total  = len(scores) or 1
	excellent  = sum(1 for s in scores if s >= 85)
	good       = sum(1 for s in scores if 70 <= s < 85)
	needs_work = sum(1 for s in scores if s < 70)
	return {
		"excellent":  {"count": excellent,  "pct": round(excellent/total*100)},
		"good":       {"count": good,       "pct": round(good/total*100)},
		"needs_work": {"count": needs_work, "pct": round(needs_work/total*100)},
	}

@router.get("/activity-feed")
async def activity_feed(limit: int = Query(20, le=100),
						db: AsyncSession = Depends(get_db),
						_: User = Depends(current_user)):
	viol_rows = await db.execute(
		select(Violation, Call.call_ref, User.name)
		.join(Call, Call.id == Violation.call_id)
		.join(Agent, Agent.id == Violation.agent_id)
		.join(User, User.id == Agent.user_id)
		.order_by(desc(Violation.detected_at))
		.limit(limit // 2)
	)
	audit_rows = await db.execute(
		select(AuditResult, Call.call_ref, User.name)
		.join(Call, Call.id == AuditResult.call_id)
		.join(Agent, Agent.id == Call.agent_id)
		.join(User, User.id == Agent.user_id)
		.order_by(desc(AuditResult.audited_at))
		.limit(limit // 2)
	)
	feed = []
	for v, ref, name in viol_rows:
		feed.append({"type": "violation", "msg": f"Call {ref} flagged — {v.violation_type}",
					 "severity": v.severity, "ts": v.detected_at.isoformat()})
	for a, ref, name in audit_rows:
		feed.append({"type": "audit", "msg": f"Agent {name} scored {a.overall_score}/100 on {ref}",
					 "score": a.overall_score, "ts": a.audited_at.isoformat()})
	feed.sort(key=lambda x: x["ts"], reverse=True)
	return feed[:limit]
