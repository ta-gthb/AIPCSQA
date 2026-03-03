import uuid, enum
from sqlalchemy import Column, String, Enum, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class UserRole(str, enum.Enum):
	supervisor = "supervisor"
	agent      = "agent"
	admin      = "admin"

class User(Base):
	__tablename__ = "users"
	id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	email      = Column(String, unique=True, nullable=False, index=True)
	name       = Column(String, nullable=False)
	role       = Column(Enum(UserRole), default=UserRole.agent)
	team       = Column(String)
	password_hash = Column(String, nullable=False)
	is_active  = Column(Boolean, default=True)
	created_at = Column(DateTime(timezone=True), server_default=func.now())
