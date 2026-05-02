"""Supabase Storage service for persisting audio recordings."""

from supabase import create_client, Client
from config import settings
import io

_supabase_client: Client | None = None


def get_supabase_client() -> Client:
	"""Get or create Supabase client."""
	global _supabase_client
	if _supabase_client is None:
		if not settings.SUPABASE_URL or not settings.SUPABASE_API_KEY:
			raise ValueError("SUPABASE_URL and SUPABASE_API_KEY must be configured")
		_supabase_client = create_client(settings.SUPABASE_URL, settings.SUPABASE_API_KEY)
	return _supabase_client


async def upload_audio_to_supabase(file_name: str, file_content: bytes) -> str:
	"""Upload audio file to Supabase Storage.
	
	Args:
		file_name: Original filename (e.g., "550e8400-e29b-41d4-a716-446655440000.mp3")
		file_content: File content as bytes
		
	Returns:
		URL to access the uploaded file
	"""
	try:
		client = get_supabase_client()
		
		# Upload to bucket
		response = client.storage.from_(settings.SUPABASE_BUCKET).upload(
			path=file_name,
			file=io.BytesIO(file_content),
			file_options={"content-type": "audio/mpeg", "upsert": True}
		)
		
		# Get public URL
		public_url = client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(file_name)
		
		print(f"[supabase-storage] Uploaded: {file_name} → {public_url}")
		return public_url
		
	except Exception as exc:
		print(f"[supabase-storage] Upload failed: {exc}")
		raise


async def download_audio_from_supabase(file_name: str) -> bytes:
	"""Download audio file from Supabase Storage.
	
	Args:
		file_name: Stored filename in Supabase
		
	Returns:
		File content as bytes
	"""
	try:
		client = get_supabase_client()
		response = client.storage.from_(settings.SUPABASE_BUCKET).download(file_name)
		print(f"[supabase-storage] Downloaded: {file_name}")
		return response
		
	except Exception as exc:
		print(f"[supabase-storage] Download failed: {exc}")
		raise


async def delete_audio_from_supabase(file_name: str) -> None:
	"""Delete audio file from Supabase Storage.
	
	Args:
		file_name: Stored filename in Supabase
	"""
	try:
		client = get_supabase_client()
		client.storage.from_(settings.SUPABASE_BUCKET).remove([file_name])
		print(f"[supabase-storage] Deleted: {file_name}")
		
	except Exception as exc:
		print(f"[supabase-storage] Delete failed: {exc}")
		raise


async def get_audio_url(file_name: str) -> str:
	"""Get public URL for an audio file.
	
	Args:
		file_name: Stored filename in Supabase
		
	Returns:
		Public URL to access the file
	"""
	try:
		client = get_supabase_client()
		public_url = client.storage.from_(settings.SUPABASE_BUCKET).get_public_url(file_name)
		return public_url
		
	except Exception as exc:
		print(f"[supabase-storage] Failed to get URL: {exc}")
		raise
