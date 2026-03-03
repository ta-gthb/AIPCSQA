from typing import Dict, Set
from fastapi import WebSocket

class LiveMonitorManager:
	def __init__(self):
		self._rooms: Dict[str, Set[WebSocket]] = {}

	async def connect(self, call_id: str, ws: WebSocket):
		await ws.accept()
		self._rooms.setdefault(call_id, set()).add(ws)

	def disconnect(self, call_id: str, ws: WebSocket):
		room = self._rooms.get(call_id, set())
		room.discard(ws)
		if not room:
			self._rooms.pop(call_id, None)

	async def broadcast(self, call_id: str, payload: dict):
		room = self._rooms.get(call_id, set())
		dead = set()
		for ws in room:
			try:
				await ws.send_json(payload)
			except Exception:
				dead.add(ws)
		for ws in dead:
			self.disconnect(call_id, ws)

	async def broadcast_all(self, payload: dict):
		for call_id in list(self._rooms.keys()):
			await self.broadcast(call_id, payload)

manager = LiveMonitorManager()
