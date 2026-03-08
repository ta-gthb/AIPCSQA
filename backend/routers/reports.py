import os, uuid, json as json_mod
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from database import get_db, AsyncSessionLocal
from routers.auth import current_user
from models.user import User
from models.report import Report
from config import settings
import datetime

router = APIRouter(prefix="/reports", tags=["reports"])

DIMS = ["empathy_score", "compliance_score", "resolution_score", "professionalism", "communication"]

# Dimension scores are on a 0–10 scale (AI auditor output).
# Pass threshold: B+ or above  →  score >= 7.0
DIM_GRADE_THRESHOLDS = [
    (9.0, "A+"),
    (8.0, "A"),
    (7.0, "B+"),   # ← minimum passing grade
    (6.0, "B"),
    (5.0, "C"),
    (4.0, "D"),
    (0.0, "F"),
]
DIM_PASS_THRESHOLD = 7.0

def _letter_grade_dim(score: float) -> str:
    """Grade a 0-10 dimension score."""
    for threshold, letter in DIM_GRADE_THRESHOLDS:
        if score >= threshold:
            return letter
    return "F"

def _letter_grade(score: float) -> str:
    """Grade a 0-100 overall score by mapping to 0-10 first."""
    return _letter_grade_dim(score / 10)

class ReportRequest(BaseModel):
    title:              str
    report_type:        str
    date_range:         str | None = None   # kept for backwards compat, not required
    agent_id:           str | None = None
    supervisor_comment: str | None = None
    team:               str | None = None
    date_from:          str | None = None
    date_to:            str | None = None
    metrics:            list[str] = []
    format:             str = "json"

async def _generate(report_id: str, params: dict):
    """Background task: runs with its own DB session, builds type-specific agent report JSON."""
    async with AsyncSessionLocal() as db:
        report = await db.get(Report, uuid.UUID(report_id))
        if not report:
            return
        os.makedirs(settings.REPORT_DIR, exist_ok=True)
        filepath = os.path.join(settings.REPORT_DIR, f"{report_id}.json")

        report_type = report.report_type or "agent_performance"
        date_from_s = params.get("date_from")
        date_to_s   = params.get("date_to")

        # Parse date bounds
        dt_from = dt_to = None
        try:
            if date_from_s:
                dt_from = datetime.datetime.fromisoformat(date_from_s)
            if date_to_s:
                dt_to = datetime.datetime.fromisoformat(date_to_s) + datetime.timedelta(days=1)
        except Exception:
            pass

        data: dict = {
            "report_id":          report_id,
            "title":              report.title,
            "report_type":        report_type,
            "generated_at":       datetime.datetime.utcnow().isoformat(),
            "date_from":          date_from_s or "",
            "date_to":            date_to_s   or "",
            "supervisor_comment": params.get("supervisor_comment") or "",
        }

        agent_id = params.get("agent_id")
        if not agent_id:
            with open(filepath, "w") as f:
                json_mod.dump(data, f, indent=2)
            report.file_path = filepath
            report.file_size = "< 1 KB"
            await db.commit()
            return

        try:
            from models.agent import Agent
            from models.call  import Call
            from models.audit import AuditResult
            from models.violation import Violation

            agent_uuid = uuid.UUID(agent_id)
            agent      = await db.get(Agent, agent_uuid)

            if not agent:
                data["error"] = "Agent not found"
            else:
                agent_name = agent.user.name if agent.user else agent.agent_id
                data["agent"] = {
                    "name":     agent_name,
                    "agent_id": agent.agent_id,
                    "team":     agent.team,
                }

                # ── Build the base call+audit query with date filter ──────────
                base_q = (
                    select(Call, AuditResult)
                    .outerjoin(AuditResult, AuditResult.call_id == Call.id)
                    .where(Call.agent_id == agent_uuid)
                    .where(AuditResult.id != None)
                )
                if dt_from:
                    base_q = base_q.where(Call.created_at >= dt_from)
                if dt_to:
                    base_q = base_q.where(Call.created_at < dt_to)
                base_q = base_q.order_by(desc(Call.created_at)).limit(100)

                rows    = await db.execute(base_q)
                audited = [(c, a) for c, a in rows.all() if a]

                # ── Helper: dimension averages ────────────────────────────────
                def dim_avgs() -> dict:
                    avgs = {}
                    for d in DIMS:
                        vals = [getattr(a, d) for _, a in audited if getattr(a, d) is not None]
                        clean = d.replace("_score", "")
                        avgs[clean] = round(sum(vals) / len(vals), 1) if vals else 0
                    return avgs

                overall = round(sum(a.overall_score for _, a in audited) / len(audited), 1) if audited else 0

                # ── AGENT PERFORMANCE ─────────────────────────────────────────
                if report_type in ("agent_performance", "custom"):
                    avgs = dim_avgs()

                    # Improvement suggestions (unique)
                    suggestions: list[str] = []
                    for _, a in audited[:10]:
                        if a.suggestions:
                            for s in a.suggestions:
                                text = s.get("suggestion") or s.get("text") or (str(s) if isinstance(s, str) else "")
                                if text and text not in suggestions:
                                    suggestions.append(text)

                    # Trend: last 5 scores (chronological order)
                    trend = [
                        {"date": c.created_at.strftime("%Y-%m-%d"), "score": a.overall_score}
                        for c, a in reversed(audited[:20])
                    ]

                    data["performance"] = {
                        "overall_score":   overall,
                        "calls_analyzed":  len(audited),
                        "dimensions":      avgs,
                        "score_trend":     trend[-10:],
                        "pass_threshold":  85,
                        "status":          "PASS" if overall >= 70 else "NEEDS IMPROVEMENT",
                    }
                    data["improvement_areas"] = suggestions[:6]
                    data["call_history"] = [
                        {"call_ref": c.call_ref, "channel": c.channel,
                         "score": a.overall_score, "passed": a.overall_score >= 85,
                         "date": c.created_at.isoformat()}
                        for c, a in audited[:15]
                    ]

                # ── COMPLIANCE / VIOLATIONS ───────────────────────────────────
                if report_type in ("compliance", "custom"):
                    vio_q = select(Violation).where(Violation.agent_id == agent_uuid)
                    if dt_from:
                        vio_q = vio_q.where(Violation.detected_at >= dt_from)
                    if dt_to:
                        vio_q = vio_q.where(Violation.detected_at < dt_to)
                    vio_q = vio_q.order_by(desc(Violation.detected_at))

                    vio_rows = await db.execute(vio_q)
                    violations = vio_rows.scalars().all()

                    # Count by type
                    by_type: dict = {}
                    by_sev:  dict = {}
                    for v in violations:
                        t_key = v.violation_type or "unknown"
                        s_key = v.severity or "medium"
                        by_type[t_key] = by_type.get(t_key, 0) + 1
                        by_sev[s_key]  = by_sev.get(s_key, 0)  + 1

                    total_audited = len(audited)
                    compliant     = total_audited - len({v.call_id for v in violations})
                    compliance_pc = round(compliant / total_audited * 100, 1) if total_audited else 0

                    data["compliance"] = {
                        "total_violations": len(violations),
                        "compliance_rate":  compliance_pc,
                        "by_type":          by_type,
                        "by_severity":      by_sev,
                        "calls_with_violation": len({str(v.call_id) for v in violations}),
                        "calls_analyzed":   total_audited,
                    }
                    data["violations_log"] = [
                        {"type": v.violation_type, "severity": v.severity,
                         "description": v.description, "date": v.detected_at.isoformat() if v.detected_at else ""}
                        for v in violations[:20]
                    ]

                # ── SCORECARD (letter grades, 0-10 dimension scale) ────────────
                if report_type in ("scorecard", "custom"):
                    avgs = dim_avgs()          # dimension scores on 0-10 scale
                    scorecard_dims = {}
                    for dim, score in avgs.items():
                        grade = _letter_grade_dim(score)
                        scorecard_dims[dim] = {
                            "score":     score,
                            "grade":     grade,
                            "threshold": DIM_PASS_THRESHOLD,   # 7.0
                            "passed":    score >= DIM_PASS_THRESHOLD,
                        }

                    # Overall grade = average of all dimension scores (0-10 scale)
                    dim_scores = [v["score"] for v in scorecard_dims.values() if v["score"] is not None]
                    dim_overall = round(sum(dim_scores) / len(dim_scores), 2) if dim_scores else 0.0
                    overall_grade  = _letter_grade_dim(dim_overall)
                    overall_passed = dim_overall >= DIM_PASS_THRESHOLD

                    passes = sum(1 for info in scorecard_dims.values() if info["passed"])
                    data["scorecard"] = {
                        "overall_score":       overall,          # 0-100 audit composite
                        "dim_overall_score":   dim_overall,      # 0-10  avg of dimensions
                        "overall_grade":       overall_grade,    # graded from dim avg
                        "overall_passed":      overall_passed,
                        "dimensions":          scorecard_dims,
                        "dimensions_passed":   passes,
                        "dimensions_total":    len(scorecard_dims),
                        "calls_analyzed":      len(audited),
                        "pass_threshold":      DIM_PASS_THRESHOLD,
                        "pass_grade":          "B+",
                    }

        except Exception as exc:
            data["agent_data_error"] = str(exc)

        with open(filepath, "w") as f:
            json_mod.dump(data, f, indent=2)

        size_kb          = os.path.getsize(filepath) // 1024
        report.file_path = filepath
        report.file_size = f"{size_kb} KB" if size_kb > 0 else "< 1 KB"
        await db.commit()

@router.post("/generate", status_code=202)
async def generate_report(body: ReportRequest, bg: BackgroundTasks,
						  db: AsyncSession = Depends(get_db),
						  user: User = Depends(current_user)):
	# Resolve agent name for the list view
	agent_name = None
	if body.agent_id:
		from models.agent import Agent
		try:
			a = await db.get(Agent, uuid.UUID(body.agent_id))
			if a:
				agent_name = a.user.name if a.user else a.agent_id
		except Exception:
			pass

	params = body.dict()
	if agent_name:
		params["agent_name"] = agent_name

	rid    = uuid.uuid4()
	report = Report(id=rid, title=body.title, report_type=body.report_type,
					created_by=user.id, format="json", params=params)
	db.add(report)
	await db.commit()
	bg.add_task(_generate, str(rid), params)
	return {"report_id": str(rid), "message": "Report generation started"}

@router.get("/my-reports")
async def my_reports(
	date_from: str | None = None,
	date_to:   str | None = None,
	db: AsyncSession = Depends(get_db),
	user: User = Depends(current_user)
):
	"""Agent-facing: returns reports generated for this agent by the supervisor."""
	from models.agent import Agent
	agent = await db.scalar(select(Agent).where(Agent.user_id == user.id))
	if not agent:
		# User has no agent record — return empty list gracefully
		return []
	aid = str(agent.id)

	# Build date-range query on the base Report table (no JSON filter here —
	# JSON path operators require JSONB; we filter in Python instead)
	q = select(Report).order_by(desc(Report.created_at))
	if date_from:
		try:
			q = q.where(Report.created_at >= datetime.datetime.fromisoformat(date_from))
		except Exception:
			pass
	if date_to:
		try:
			dt = datetime.datetime.fromisoformat(date_to) + datetime.timedelta(days=1)
			q = q.where(Report.created_at < dt)
		except Exception:
			pass

	rows = await db.execute(q)
	result = []
	for r, in rows:
		# Filter by agent_id stored in the params JSON field (Python-side)
		params = r.params or {}
		if params.get("agent_id") != aid:
			continue
		report_data = None
		if r.file_path and os.path.exists(r.file_path):
			try:
				with open(r.file_path) as f:
					report_data = json_mod.load(f)
			except Exception:
				pass
		result.append({
			"id":         str(r.id),
			"title":      r.title,
			"type":       r.report_type,
			"format":     r.format,
			"size":       r.file_size,
			"created_at": r.created_at.isoformat(),
			"ready":      r.file_path is not None,
			"data":       report_data,
		})
	return result

@router.get("/")
async def list_reports(db: AsyncSession = Depends(get_db),
					   _: User = Depends(current_user)):
	rows = await db.execute(
		select(Report).order_by(desc(Report.created_at)).limit(50)
	)
	return [{"id": str(r.id), "title": r.title, "type": r.report_type,
			 "format": r.format, "size": r.file_size,
			 "agent_name": (r.params or {}).get("agent_name"),
			 "created_at": r.created_at.isoformat(),
			 "ready": r.file_path is not None}
			for r, in rows]

@router.get("/{report_id}/download")
async def download_report(report_id: str, db: AsyncSession = Depends(get_db),
						  _: User = Depends(current_user)):
	try:
		rid = uuid.UUID(report_id)
	except ValueError:
		raise HTTPException(400, "Invalid report_id")
	report = await db.get(Report, rid)
	if not report or not report.file_path:
		raise HTTPException(404, "Report not ready or not found")
	return FileResponse(report.file_path,
						filename=os.path.basename(report.file_path))

@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db),
						_: User = Depends(current_user)):
	try:
		rid = uuid.UUID(report_id)
	except ValueError:
		raise HTTPException(400, "Invalid report_id")
	report = await db.get(Report, rid)
	if not report:
		raise HTTPException(404, "Report not found")
	# Remove the file from disk if present
	if report.file_path and os.path.exists(report.file_path):
		try:
			os.remove(report.file_path)
		except OSError:
			pass
	await db.delete(report)
	await db.commit()
	return {"ok": True}
