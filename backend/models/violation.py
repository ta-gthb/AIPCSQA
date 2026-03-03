import uuid, enum
from sqlalchemy import Column, String, Enum, ForeignKey, Integer, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Severity(str, enum.Enum):
	critical = "Critical"
	high     = "High"
	medium   = "Medium"
	low      = "Low"

class ViolationStatus(str, enum.Enum):
	open     = "open"
	resolved = "resolved"
	disputed = "disputed"

class Violation(Base):
	__tablename__ = "violations"
	id             = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	call_id        = Column(UUID(as_uuid=True), ForeignKey("calls.id"))
	agent_id       = Column(UUID(as_uuid=True), ForeignKey("agents.id"))
	violation_type = Column(String, nullable=False)
	severity       = Column(Enum(Severity), default=Severity.medium)
	status         = Column(Enum(ViolationStatus), default=ViolationStatus.open)
	turn_index     = Column(Integer)
	description    = Column(Text)
	detected_at    = Column(DateTime(timezone=True), server_default=func.now())
	resolved_at    = Column(DateTime(timezone=True))
	call           = relationship("Call", back_populates="violations")
