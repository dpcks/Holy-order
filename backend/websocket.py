from fastapi import WebSocket
from typing import List
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []
        self.failed_logs: List[dict] = [] # 실패한 연결 기록용

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def send_personal_message(self, data: dict, websocket: WebSocket):
        await websocket.send_json(data)

    async def broadcast(self, data: dict):
        # 순회 중 리스트 변경 방지를 위해 복사본 사용
        disconnected = []
        for connection in self.active_connections[:]:
            try:
                await connection.send_json(data)
            except Exception as e:
                # 실패한 연결 기록 (최대 100개까지만 유지하여 메모리 누수 방지)
                self.failed_logs.append({
                    "time": datetime.now().isoformat(),
                    "client": str(connection.client),
                    "error": str(e),
                    "data": data
                })
                if len(self.failed_logs) > 100:
                    self.failed_logs = self.failed_logs[-100:]
                disconnected.append(connection)
        
        for connection in disconnected:
            self.disconnect(connection)

manager = ConnectionManager()
