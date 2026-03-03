import uuid, enum
from sqlalchemy import Column, String, Integer, Float, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class CallStatus(str, enum.Enum):
	live       = "live"
	processing = "processing"
	audited    = "audited"
	failed     = "failed"

class SentimentType(str, enum.Enum):
	positive = "positive"
	neutral  = "neutral"
	negative = "negative"

class Call(Base):
	__tablename__ = "calls"
	id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	call_ref     = Column(String, unique=True, nullable=False, index=True)
	agent_id     = Column(UUID(as_uuid=True), ForeignKey("agents.id"))
	channel      = Column(String, default="phone")
	duration_sec = Column(Integer, default=0)
	status       = Column(Enum(CallStatus), default=CallStatus.processing)
	sentiment    = Column(Enum(SentimentType))
	audio_path   = Column(String)
	started_at   = Column(DateTime(timezone=True))
	ended_at     = Column(DateTime(timezone=True))
	created_at   = Column(DateTime(timezone=True), server_default=func.now())
	agent        = relationship("Agent", back_populates="calls")
	transcript   = relationship("Transcript", back_populates="call", uselist=False)
	audit        = relationship("AuditResult", back_populates="call", uselist=False)
	violations   = relationship("Violation", back_populates="call")
