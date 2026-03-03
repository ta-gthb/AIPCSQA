import uuid
from sqlalchemy import Column, String, JSON, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class Report(Base):
	__tablename__ = "reports"
	id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	title       = Column(String, nullable=False)
	report_type = Column(String)
	created_by  = Column(UUID(as_uuid=True), ForeignKey("users.id"))
	file_path   = Column(String)
	file_size   = Column(String)
	format      = Column(String, default="pdf")
	params      = Column(JSON, default=dict)
	created_at  = Column(DateTime(timezone=True), server_default=func.now())
