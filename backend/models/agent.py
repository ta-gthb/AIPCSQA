import uuid
from sqlalchemy import Column, String, Float, Integer, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Agent(Base):
	__tablename__ = "agents"
	id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	user_id      = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
	agent_id     = Column(String, unique=True, nullable=False)
	team         = Column(String, nullable=False)
	avg_score    = Column(Float, default=0.0)
	total_calls  = Column(Integer, default=0)
	violations   = Column(Integer, default=0)
	avg_handle_time = Column(Integer, default=0)
	updated_at   = Column(DateTime(timezone=True), onupdate=func.now())
	user         = relationship("User", lazy="joined")
	calls        = relationship("Call", back_populates="agent")
