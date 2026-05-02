"""Firebase Storage service for persisting audio files."""
import os
import firebase_admin
from firebase_admin import credentials, storage
from config import settings
from datetime import timedelta

class FirebaseStorageManager:
	def __init__(self):
		self.enabled = settings.FIREBASE_ENABLED
		self.bucket_name = settings.FIREBASE_STORAGE_BUCKET
		self.initialized = False
		
		if self.enabled and settings.FIREBASE_CREDENTIALS_JSON:
			self._initialize()
	
	def _initialize(self):
		"""Initialize Firebase Admin SDK."""
		try:
			creds_path = settings.FIREBASE_CREDENTIALS_JSON
			
			# Check if path is relative or absolute
			if not os.path.isabs(creds_path):
				creds_path = os.path.join(os.path.dirname(__file__), "..", creds_path)
			
			if not os.path.exists(creds_path):
				print(f"[Firebase] Credentials file not found: {creds_path}")
				return
			
			# Initialize Firebase if not already done
			if not firebase_admin._apps:
				cred = credentials.Certificate(creds_path)
				firebase_admin.initialize_app(cred, {
					"storageBucket": self.bucket_name
				})
			
			self.initialized = True
			print(f"[Firebase] Storage initialized: {self.bucket_name}")
		except Exception as e:
			print(f"[Firebase] Initialization failed: {e}")
	
	async def upload_file(self, file_path: str, remote_path: str) -> str:
		"""Upload file to Firebase Storage.
		
		Args:
			file_path: Local file path
			remote_path: Remote storage path (e.g., 'uploads/call_id/audio.mp3')
		
		Returns:
			Public download URL
		"""
		if not self.enabled or not self.initialized:
			return None
		
		try:
			bucket = storage.bucket(self.bucket_name)
			blob = bucket.blob(remote_path)
			blob.upload_from_filename(file_path)
			
			# Generate download URL valid for 365 days
			download_url = blob.generate_signed_url(
				version="v4",
				expiration=timedelta(days=365),
				method="GET"
			)
			print(f"[Firebase] Uploaded: {remote_path}")
			return download_url
		except Exception as e:
			print(f"[Firebase] Upload failed for {remote_path}: {e}")
			return None
	
	async def get_download_url(self, remote_path: str) -> str:
		"""Get download URL for existing file.
		
		Args:
			remote_path: Remote storage path
		
		Returns:
			Public download URL
		"""
		if not self.enabled or not self.initialized:
			return None
		
		try:
			bucket = storage.bucket(self.bucket_name)
			blob = bucket.blob(remote_path)
			
			url = blob.generate_signed_url(
				version="v4",
				expiration=timedelta(days=365),
				method="GET"
			)
			return url
		except Exception as e:
			print(f"[Firebase] Get URL failed for {remote_path}: {e}")
			return None
	
	async def delete_file(self, remote_path: str) -> bool:
		"""Delete file from Firebase Storage.
		
		Args:
			remote_path: Remote storage path
		
		Returns:
			True if successful
		"""
		if not self.enabled or not self.initialized:
			return False
		
		try:
			bucket = storage.bucket(self.bucket_name)
			blob = bucket.blob(remote_path)
			blob.delete()
			print(f"[Firebase] Deleted: {remote_path}")
			return True
		except Exception as e:
			print(f"[Firebase] Delete failed for {remote_path}: {e}")
			return False

# Global instance
firebase_manager = FirebaseStorageManager()
