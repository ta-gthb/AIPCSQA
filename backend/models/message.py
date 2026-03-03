import uuid, enum
from sqlalchemy import Column, String, Enum, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from database import Base

class MessageStatus(str, enum.Enum):
	unread = "unread"
	read   = "read"

class AgentMessage(Base):
	__tablename__ = "agent_messages"
	id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
	agent_id     = Column(UUID(as_uuid=True), nullable=False)
	agent_name   = Column(String, nullable=False)
	agent_ref    = Column(String)          # e.g. AGT013001
	subject      = Column(String, nullable=False)
	body         = Column(Text, nullable=False)
	status       = Column(Enum(MessageStatus), default=MessageStatus.unread)
	created_at   = Column(DateTime(timezone=True), server_default=func.now())
	replied_at   = Column(DateTime(timezone=True))
	reply        = Column(Text)
