#!/usr/bin/env python3
"""
Control WebSocket handler for backend-to-frontend commands.
"""

import json
import logging
import tornado.web
import tornado.websocket

logger = logging.getLogger(__name__)


class ControlWebSocketHandler(tornado.websocket.WebSocketHandler):
    """WebSocket handler for backend-to-frontend control commands."""

    _connections = {}  # {connection_id: handler}

    def check_origin(self, origin):
        return True

    def open(self):
        self.connection_id = self.get_argument('id', None)
        if not self.connection_id:
            self.close(code=1002, reason='Missing connection id')
            return

        self._connections[self.connection_id] = self
        logger.info(f"Control WebSocket connected: {self.connection_id}")

    def on_close(self):
        if hasattr(self, 'connection_id') and self.connection_id:
            self._connections.pop(self.connection_id, None)
            logger.info(f"Control WebSocket disconnected: {self.connection_id}")

    @classmethod
    def send_command(cls, connection_id, action, payload=None):
        """Send command to specific client by connection_id."""
        conn = cls._connections.get(connection_id)
        if conn:
            message = json.dumps([action, payload])
            conn.write_message(message)
            return True
        logger.warning(f"Connection not found: {connection_id}")
        return False


class ControlApiHandler(tornado.web.RequestHandler):
    """HTTP API handler for sending control commands."""

    def set_default_headers(self):
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with, Content-Type")
        self.set_header('Access-Control-Allow-Methods', 'POST, OPTIONS')

    def options(self):
        self.set_status(204)
        self.finish()

    def post(self):
        """Send command to frontend via control WebSocket.

        Request body:
            {
                "connection_id": "abc123",
                "action": "open_window",
                "payload": {"type": "markdown", "filename": "README.md"}
            }
        """
        try:
            data = json.loads(self.request.body.decode('utf-8'))
            connection_id = data.get('connection_id')
            action = data.get('action')
            payload = data.get('payload')

            if not connection_id:
                self.set_status(400)
                self.write({"error": "Missing connection_id"})
                return

            if not action:
                self.set_status(400)
                self.write({"error": "Missing action"})
                return

            success = ControlWebSocketHandler.send_command(connection_id, action, payload)
            if success:
                self.write({"status": "ok"})
            else:
                self.set_status(404)
                self.write({"error": f"Connection not found: {connection_id}"})

        except json.JSONDecodeError as e:
            self.set_status(400)
            self.write({"error": f"Invalid JSON: {e}"})
        except Exception as e:
            logger.error(f"Control API error: {e}")
            self.set_status(500)
            self.write({"error": str(e)})

