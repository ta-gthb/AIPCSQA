import uuid
from sqlalchemy import Column, ForeignKey, JSON, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Transcript(Base):
	__tablename__ = "transcripts"
	id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	call_id    = Column(UUID(as_uuid=True), ForeignKey("calls.id"), unique=True)
	turns      = Column(JSON, nullable=False, default=list)
	raw_text   = Column(Text)
	created_at = Column(DateTime(timezone=True), server_default=func.now())
	call       = relationship("Call", back_populates="transcript")
