from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import engine, Base

from models import user, agent, call, transcript, audit, violation, report, message  # noqa

from routers import auth, dashboard, agents, transcripts, compliance, reports, live_monitor, simulation

app = FastAPI(
	title="AIPCSQA API",
	description="AI-powered customer support quality auditing platform",
	version="1.0.0",
)

app.add_middleware(
	CORSMiddleware,
	allow_origins=["http://localhost:3000", "https://your-frontend.com"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

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

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(agents.router)
app.include_router(transcripts.router)
app.include_router(compliance.router)
app.include_router(reports.router)
app.include_router(live_monitor.router)
app.include_router(simulation.router)

@app.get("/health")
async def health():
	return {"status": "ok", "service": "AIPCSQA"}
