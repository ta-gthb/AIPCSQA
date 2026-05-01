
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import JWTError, jwt
from pydantic import BaseModel, EmailStr
import hashlib, secrets

from database import get_db
from models.user import User, UserRole
from config import settings

router = APIRouter(prefix="/auth", tags=["auth"])
oauth2 = OAuth2PasswordBearer(tokenUrl="/auth/login")

def hash_password(password: str) -> str:
	salt = secrets.token_hex(32)
	hashed = hashlib.sha256((salt + password).encode()).hexdigest()
	return f"{salt}:{hashed}"

def verify_password(password: str, hashed: str) -> bool:
	try:
		salt, hash_val = hashed.split(":")
		return hashlib.sha256((salt + password).encode()).hexdigest() == hash_val
	except Exception:
		return False

class RegisterIn(BaseModel):
	name:     str
	email:    EmailStr
	password: str
	role:     UserRole = UserRole.agent
	team:     str | None = None

class TokenOut(BaseModel):
	access_token: str
	token_type:   str = "bearer"
	user_id:      str
	role:         str
	name:         str

def make_token(data: dict, expires_delta: timedelta | None = None) -> str:
	expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
	return jwt.encode({**data, "exp": expire}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

async def current_user(token: str = Depends(oauth2), db: AsyncSession = Depends(get_db)) -> User:
	cred_exc = HTTPException(status.HTTP_401_UNAUTHORIZED, "Could not validate credentials",
							 headers={"WWW-Authenticate": "Bearer"})
	try:
		payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
		uid: str = payload.get("sub")
		if not uid:
			raise cred_exc
	except JWTError:
		raise cred_exc
	user = await db.get(User, uid)
	if not user or not user.is_active:
		raise cred_exc
	return user

@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, db: AsyncSession = Depends(get_db)):
	existing = await db.scalar(select(User).where(User.email == body.email))
	if existing:
		raise HTTPException(400, "Email already registered")
	user = User(
		name=body.name, email=body.email, role=body.role, team=body.team,
		password_hash=hash_password(body.password)
	)
	db.add(user)
	await db.commit()
	await db.refresh(user)

	# If registering an agent, create Agent record and generate agent_id
	agent_id = None
	if user.role == UserRole.agent:
		# Get current max serial number for AGT013XXX format
		from models.agent import Agent
		result = await db.execute(select(Agent.agent_id))
		agent_ids = [row[0] for row in result]
		serials = [int(a[-3:]) for a in agent_ids if a and a.startswith('AGT013') and a[-3:].isdigit()]
		next_serial = max(serials, default=0) + 1
		agent_id = f"AGT013{next_serial:03d}"
		agent = Agent(user_id=user.id, agent_id=agent_id, team=user.team or "")
		db.add(agent)
		await db.commit()
		await db.refresh(agent)

	token = make_token({"sub": str(user.id)})
	return TokenOut(access_token=token, user_id=str(user.id), role=user.role, name=user.name)

@router.post("/login", response_model=TokenOut)
async def login(form: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
	user = await db.scalar(select(User).where(User.email == form.username))
	if not user or not verify_password(form.password, user.password_hash):
		raise HTTPException(401, "Invalid credentials")
	token = make_token({"sub": str(user.id)})
	return TokenOut(access_token=token, user_id=str(user.id), role=user.role, name=user.name)

@router.post("/change-password")
async def change_password(
	old_password: str,
	new_password: str,
	db: AsyncSession = Depends(get_db),
	user: User = Depends(current_user)
):
	if not verify_password(old_password, user.password_hash):
		raise HTTPException(400, "Current password is incorrect")
	if len(new_password) < 6:
		raise HTTPException(400, "New password must be at least 6 characters")
	user.password_hash = hash_password(new_password)
	await db.commit()
	return {"detail": "Password changed successfully"}

@router.get("/me")
async def me(user: User = Depends(current_user)):
	return {"id": str(user.id), "name": user.name, "email": user.email,
			"role": user.role, "team": user.team}

@router.post("/keep-alive")
async def keep_alive():
	"""Health check endpoint to keep backend active - no authentication required"""
	return {"status": "ok", "message": "Backend is active"}
