from pydantic_settings import BaseSettings

class Settings(BaseSettings):
	DATABASE_URL: str = "postgresql+asyncpg://user:pass@localhost/auditai"
	SECRET_KEY: str = "change-me-in-production"
	ALGORITHM: str = "HS256"
	ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
	OPENAI_API_KEY: str
	OPENAI_BASE_URL: str = "https://api.groq.com/openai/v1"
	REPORT_DIR: str = "./reports"
	UPLOAD_DIR: str = "./uploads"
	MAX_AUDIO_MB: int = 50
	ASSEMBLYAI_API_KEY: str = ""
	FRONTEND_URL: str = "http://localhost:3000"
	SELF_PING_ENABLED: bool = True
	SELF_PING_URL: str = ""
	SELF_PING_INTERVAL_SECONDS: int = 60
	# Supabase Storage configuration for audio files
	SUPABASE_URL: str = ""
	SUPABASE_API_KEY: str = ""
	SUPABASE_BUCKET: str = "audio-recordings"
	USE_SUPABASE_STORAGE: bool = True

	class Config:
		env_file = ".env"

settings = Settings()
