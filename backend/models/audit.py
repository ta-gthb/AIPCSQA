import uuid
from sqlalchemy import Column, ForeignKey, Float, JSON, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class AuditResult(Base):
	__tablename__ = "audit_results"
	id               = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	call_id          = Column(UUID(as_uuid=True), ForeignKey("calls.id"), unique=True)
	overall_score    = Column(Float)
	empathy_score    = Column(Float)
	compliance_score = Column(Float)
	resolution_score = Column(Float)
	professionalism  = Column(Float)
	communication    = Column(Float)
	suggestions      = Column(JSON, default=list)
	raw_ai_response  = Column(JSON)
	audited_at       = Column(DateTime(timezone=True), server_default=func.now())
	call             = relationship("Call", back_populates="audit")
