import os
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from database import engine, Base
from config import settings

from models import user, agent, call, transcript, audit, violation, report, message  # noqa

from routers import auth, dashboard, agents, transcripts, compliance, reports, live_monitor, simulation

app = FastAPI(
	title="AIPCSQA API",
	description="AI-powered customer support quality auditing platform",
	version="1.0.0",
)

# Allow all origins (Bearer token auth - no cookies involved)
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=False,
	allow_methods=["*"],
	allow_headers=["*"],
)

# ── Self-ping to prevent Render free-tier sleep ────────────────────────────
async def _self_ping():
	"""Ping our own /health endpoint every 10 minutes so Render doesn't idle us out."""
	import httpx
	ping_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
	if not ping_url:
		print("[self-ping] RENDER_EXTERNAL_URL not set — self-ping disabled")
		return
	ping_url = f"{ping_url}/health"
	print(f"[self-ping] Starting keep-alive pings every 10 min → {ping_url}")
	async with httpx.AsyncClient(timeout=10) as client:
		while True:
			await asyncio.sleep(10 * 60)  # 10 minutes
			try:
				r = await client.get(ping_url)
				print(f"[self-ping] {ping_url} → {r.status_code}")
			except Exception as e:
				print(f"[self-ping] ping failed: {e}")

@app.on_event("startup")
async def on_startup():
	async with engine.begin() as conn:
		await conn.run_sync(Base.metadata.create_all)

	# Create default supervisor if not exists
	from models.user import User, UserRole
	import secrets, hashlib
	from database import AsyncSessionLocal
	async with AsyncSessionLocal() as session:
		result = await session.execute(
			User.__table__.select().where(User.role == UserRole.supervisor)
		)
		supervisor = result.first()
		if not supervisor:
			default_email = "supervisor@aipcsqa.com"
			default_password = "supervisor@123"
			salt = secrets.token_hex(32)
			password_hash = f"{salt}:{hashlib.sha256((salt + default_password).encode()).hexdigest()}"
			user = User(
				name="Supervisor",
				email=default_email,
				role=UserRole.supervisor,
				team="Supervisors",
				password_hash=password_hash
			)
			session.add(user)
			await session.commit()
			print(f"Default supervisor created: {default_email} / {default_password}")

	# Start background self-ping loop
	asyncio.create_task(_self_ping())

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(agents.router)
app.include_router(transcripts.router)
app.include_router(compliance.router)
app.include_router(reports.router)
app.include_router(live_monitor.router)
app.include_router(simulation.router)

# Serve uploaded recordings
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.get("/health")
async def health():
	return {"status": "ok", "service": "AIPCSQA"}
