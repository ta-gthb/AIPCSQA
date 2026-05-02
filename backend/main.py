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
	"""Resolve self-ping URL from explicit setting or Render hostname.
	Pings /auth/ping endpoint which simulates sign-in without credentials."""
	if settings.SELF_PING_URL:
		base = settings.SELF_PING_URL.strip().rstrip("/")
		return base if base.endswith("/auth/ping") else f"{base}/auth/ping"

	render_external = os.getenv("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
	if render_external:
		if render_external.startswith("http://") or render_external.startswith("https://"):
			return f"{render_external}/auth/ping"
		return f"https://{render_external}/auth/ping"

	render_host = os.getenv("RENDER_EXTERNAL_HOSTNAME", "").strip().rstrip("/")
	if render_host:
		if render_host.startswith("http://") or render_host.startswith("https://"):
			return f"{render_host}/auth/ping"
		return f"https://{render_host}/auth/ping"

	return ""


def _should_enable_self_ping() -> bool:
	"""Enable self-ping explicitly, or automatically when running on Render."""
	if settings.SELF_PING_ENABLED:
		return True
	# Render always exposes one of these env vars for web services.
	return bool(os.getenv("RENDER")) or bool(os.getenv("RENDER_SERVICE_ID"))


async def _self_ping_worker(url: str, interval_seconds: int):
	"""Periodically ping /auth/ping endpoint to keep backend alive.
	Simulates user sign-in action without requiring credentials."""
	client = httpx.AsyncClient(timeout=10.0, follow_redirects=True)
	try:
		while True:
			try:
				res = await client.get(url)
				if res.status_code == 200:
					print(f"[self-ping] {res.status_code} - Backend kept active")
				elif res.status_code >= 400:
					print(f"[self-ping] non-2xx status: {res.status_code}")
			except Exception as exc:
				print(f"[self-ping] failed: {exc}")
			await asyncio.sleep(interval_seconds)
	finally:
		await client.aclose()

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

	if _should_enable_self_ping():
		url = _resolve_self_ping_url()
		if url:
			interval = max(2, int(settings.SELF_PING_INTERVAL_SECONDS))
			_self_ping_task = asyncio.create_task(_self_ping_worker(url, interval))
			print(f"[self-ping] enabled: {url} every {interval}s")
		else:
			print("[self-ping] enabled but URL not available; set SELF_PING_URL or ensure RENDER_EXTERNAL_URL / RENDER_EXTERNAL_HOSTNAME exists")


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
# If Supabase is configured, serve audio via redirect endpoint
# Otherwise, serve from local directory
if not (settings.USE_SUPABASE_STORAGE and settings.SUPABASE_URL and settings.SUPABASE_API_KEY):
	os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
	app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

@app.get("/audio/{file_name}")
async def get_audio(file_name: str):
	"""Get audio file from Supabase Storage or local storage.
	
	For Supabase: Returns redirect to public URL
	For local: Returns the audio file directly
	"""
	if settings.USE_SUPABASE_STORAGE and settings.SUPABASE_URL and settings.SUPABASE_API_KEY:
		# Redirect to Supabase public URL
		from services.storage import get_audio_url
		from fastapi.responses import RedirectResponse
		try:
			url = await get_audio_url(file_name)
			return RedirectResponse(url=url)
		except Exception as exc:
			raise HTTPException(404, f"Audio file not found: {exc}")
	else:
		# Serve from local storage
		import mimetypes
		file_path = os.path.join(settings.UPLOAD_DIR, file_name)
		if not os.path.exists(file_path):
			raise HTTPException(404, "Audio file not found")
		if not os.path.isfile(file_path):
			raise HTTPException(403, "Invalid file")
		mime_type, _ = mimetypes.guess_type(file_path)
		from fastapi.responses import FileResponse
		return FileResponse(file_path, media_type=mime_type or "audio/mpeg")

@app.get("/health")
async def health():
	return {"status": "ok", "service": "AIPCSQA"}

@app.get("/debug/calls")
async def debug_calls():
	"""Debug endpoint to check if audio_path is being stored."""
	from database import AsyncSessionLocal
	from models.call import Call
	from sqlalchemy import select
	
	async with AsyncSessionLocal() as db:
		calls = await db.execute(select(Call).limit(5))
		results = []
		for call in calls.scalars():
			results.append({
				"id": str(call.id),
				"call_ref": call.call_ref,
				"audio_path": call.audio_path,
				"channel": call.channel,
				"status": call.status,
			})
		return {"calls": results}
