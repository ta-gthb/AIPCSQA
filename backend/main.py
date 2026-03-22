import os
import mimetypes
import asyncio
from contextlib import suppress
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import httpx
from database import engine, Base
from config import settings

# Ensure .webm audio files are served with the correct MIME type.
# Python's default mimetypes maps .webm -> video/webm which browsers
# refuse to play in <audio> elements.
mimetypes.add_type("audio/webm", ".webm")
mimetypes.add_type("audio/ogg",  ".ogg")

from models import user, agent, call, transcript, audit, violation, report, message  # noqa

from routers import auth, dashboard, agents, transcripts, compliance, reports, live_monitor, simulation

_self_ping_task = None


def _resolve_self_ping_url() -> str:
	"""Resolve self-ping URL from explicit setting or Render hostname."""
	if settings.SELF_PING_URL:
		base = settings.SELF_PING_URL.strip().rstrip("/")
		return base if base.endswith("/health") else f"{base}/health"

	render_external = os.getenv("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
	if not render_external:
		return ""
	if render_external.startswith("http://") or render_external.startswith("https://"):
		return f"{render_external}/health"
	return f"https://{render_external}/health"


async def _self_ping_worker(url: str, interval_seconds: int):
	"""Periodically ping this service to keep it warm on hosts that allow it."""
	while True:
		try:
			async with httpx.AsyncClient(timeout=10.0) as client:
				await client.get(url)
		except Exception as exc:
			print(f"[self-ping] failed: {exc}")
		await asyncio.sleep(interval_seconds)

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

@app.on_event("startup")
async def on_startup():
	global _self_ping_task
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

	if settings.SELF_PING_ENABLED:
		url = _resolve_self_ping_url()
		if url:
			interval = max(60, int(settings.SELF_PING_INTERVAL_SECONDS))
			_self_ping_task = asyncio.create_task(_self_ping_worker(url, interval))
			print(f"[self-ping] enabled: {url} every {interval}s")
		else:
			print("[self-ping] enabled but URL not available; set SELF_PING_URL or RENDER_EXTERNAL_URL")


@app.on_event("shutdown")
async def on_shutdown():
	global _self_ping_task
	if _self_ping_task:
		_self_ping_task.cancel()
		with suppress(asyncio.CancelledError):
			await _self_ping_task
		_self_ping_task = None

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
