"""Sandbox API handler for creating and managing sandbox instances."""

import json
import logging
from typing import Optional

import tornado.web

from backend.sandbox.manager import get_sandbox_manager


logger = logging.getLogger(__name__)


def handle_errors(method):
    """Decorator to handle exceptions for route handlers and return JSON errors."""
    async def wrapper(self, *args, **kwargs):
        try:
            return await method(self, *args, **kwargs)
        except tornado.web.HTTPError as e:
            self.set_status(e.status_code)
            self.write({"error": e.log_message or str(e)})
        except ValueError as e:
            self.set_status(404)
            self.write({"error": str(e)})
        except Exception as e:
            logger.error(f"Request error: {e}")
            self.set_status(500)
            self.write({"error": "Internal server error"})
    return wrapper


class SandboxHandler(tornado.web.RequestHandler):
    """
    Handler for sandbox operations.

    Routes:
        GET /api/sandbox - list all sandboxes
        POST /api/sandbox - create new sandbox
        GET /api/sandbox/{sandboxId} - get sandbox info
        POST /api/sandbox/{sandboxId}/command - execute command
        DELETE /api/sandbox/{sandboxId} - kill sandbox
    """

    def initialize(self, action: str | None = None):
        """Initialize handler with sandbox manager."""
        self.manager = get_sandbox_manager()
        self.action = action

    def set_default_headers(self):
        """Set CORS headers."""
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with, content-type")
        self.set_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')

    def options(self, sandbox_id: Optional[str] = None):
        """Handle OPTIONS request for CORS preflight."""
        self.set_status(204)
        self.finish()

    @handle_errors
    async def get(self, sandbox_id: Optional[str] = None):
        """Handle GET requests."""
        if sandbox_id is None:
            # List all sandboxes
            result = await self.manager.list_sandboxes()
            self.write(json.dumps(result))
        else:
            # Get sandbox info
            result = await self.manager.get_sandbox_info(sandbox_id)
            self.write(json.dumps(result))
        self.set_header("Content-Type", "application/json")

    @handle_errors
    async def post(self, sandbox_id: Optional[str] = None):
        """Handle POST requests."""
        if sandbox_id is None:
            # Create new sandbox
            try:
                body = json.loads(self.request.body)
            except json.JSONDecodeError as e:
                raise tornado.web.HTTPError(400, f"Invalid JSON in request body: {e}")

            result = await self.manager.create_sandbox(
                provider=body.get('provider'),
                sandbox_id=body.get('sandbox_id'),
                image=body.get('image'),
                init_commands=body.get('init_commands'),
                env=body.get('env'),
                expire_time=body.get('expire_time')
            )
            self.write(json.dumps(result))
            self.set_header("Content-Type", "application/json")
        else:
            # Execute command in sandbox
            try:
                body = json.loads(self.request.body)
                command = body.get('command', '').strip()
            except json.JSONDecodeError:
                raise tornado.web.HTTPError(400, "Invalid JSON in request body")

            if not command:
                raise tornado.web.HTTPError(400, "Command is required")

            result = await self.manager.execute_command(sandbox_id, command)

            self.write(json.dumps({
                'output': result.output,
                'error': result.error,
                'exitCode': result.exit_code
            }))
            self.set_header("Content-Type", "application/json")

    @handle_errors
    async def delete(self, sandbox_id: Optional[str] = None):
        """Handle DELETE requests."""
        if sandbox_id is None:
            raise tornado.web.HTTPError(404)

        await self.manager.kill_sandbox(sandbox_id)
        self.set_status(204)
        self.finish()
