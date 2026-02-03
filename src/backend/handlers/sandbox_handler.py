#!/usr/bin/env python3
"""
Sandbox API handler for creating and managing OpenSandbox instances.
"""

import json
import logging
from typing import Optional

import tornado.web
from opensandbox import Sandbox
from opensandbox.exceptions.sandbox import SandboxApiException
from opensandbox.manager import SandboxManager as OSSandboxManager
from opensandbox.models.sandboxes import SandboxImageSpec, SandboxFilter
from opensandbox.config import ConnectionConfig

logger = logging.getLogger(__name__)


def handle_errors(method):
    """Decorator to handle exceptions for route handlers and return JSON errors."""
    async def wrapper(self, *args, **kwargs):
        try:
            return await method(self, *args, **kwargs)
        except tornado.web.HTTPError as e:
            self.set_status(e.status_code)
            self.write({"error": e.log_message or str(e)})
        except SandboxApiException as e:
            self.set_status(404)
            self.write({"error": str(e)})
        except ValueError as e:
            self.set_status(404)
            self.write({"error": str(e)})
        except Exception as e:
            logger.error(f"Request error: {e}")
            self.set_status(500)
            self.write({"error": "Internal server error"})
    return wrapper


_singleton_manager: "SandboxManager | None" = None


def get_sandbox_manager() -> "SandboxManager":
    """Get singleton SandboxManager instance."""
    global _singleton_manager
    if _singleton_manager is None:
        _singleton_manager = SandboxManager()
    return _singleton_manager


class SandboxManager:
    """Manager for sandbox instances using opensandbox.SandboxManager."""

    def __init__(self):
        self._sandboxes: dict[str, Sandbox] = {}
        self._connection_config = ConnectionConfig(domain="localhost:8081")
        self._manager: Optional[OSSandboxManager] = None

    async def get_manager(self) -> OSSandboxManager:
        """Get opensandbox.SandboxManager."""
        if self._manager is None:
            self._manager = await OSSandboxManager.create(self._connection_config)
        return self._manager

    def _get_image(self) -> SandboxImageSpec:
        """Get sandbox image specification."""
        return SandboxImageSpec(image="sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1")

    async def create_sandbox(self, image: Optional[str] = None, init_commands: Optional[list] = None, env: Optional[dict] = None) -> dict:
        """Create a new sandbox."""
        logger.info(f"create_sandbox: image={image}, init_commands={init_commands}, env={env}")
        image_uri = image or "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"

        sandbox = await Sandbox.create(
            image=SandboxImageSpec(image=image_uri),
            resource={"cpu": "2", "memory": "2048Mi"},
            connection_config=self._connection_config,
            skip_health_check=False,
            env=env
        )

        sandbox_id = sandbox.id
        self._sandboxes[sandbox_id] = sandbox

        info = await sandbox.get_info()
        logger.info(f"Created sandbox: {sandbox_id}, status: {info.status.state}")

        # Execute init commands if provided
        if init_commands:
            for cmd in init_commands:
                logger.info(f"Executing init command in sandbox {sandbox_id}: {cmd}")
                try:
                    await sandbox.commands.run(cmd)
                except Exception as e:
                    logger.error(f"Error executing init command: {e}")

        return {
            'id': sandbox_id,
            'status': info.status.state
        }

    async def list_sandboxes(self) -> list[dict]:
        """List all sandboxes."""
        manager = await self.get_manager()

        result = await manager.list_sandbox_infos(SandboxFilter())
        return [{'id': sb.id} for sb in result.sandbox_infos]

    async def get_sandbox_info(self, sandbox_id: str) -> dict:
        """Get sandbox info from remote manager."""
        manager = await self.get_manager()

        info = await manager.get_sandbox_info(sandbox_id)

        return {
            'id': sandbox_id,
            'status': info.status.state
        }

    async def execute_command(self, sandbox_id: str, command: str) -> dict:
        """Execute command in sandbox."""
        sandbox = self._sandboxes.get(sandbox_id)
        if sandbox is None:
            logger.info(f"Reconnecting to sandbox: {sandbox_id}")
            sandbox = await Sandbox.connect(sandbox_id, self._connection_config)
            self._sandboxes[sandbox_id] = sandbox

        logger.info(f"Executing command in sandbox {sandbox_id}: {command}")

        result = await sandbox.commands.run(command)

        stdout = "\n".join([line.text for line in result.logs.stdout]) if result.logs.stdout else ""
        stderr = "\n".join([line.text for line in result.logs.stderr]) if result.logs.stderr else ""

        # Execution model doesn't have exit_code - use error presence as indicator
        exit_code = 1 if result.error else 0

        return {
            'output': stdout,
            'error': stderr,
            'exitCode': exit_code
        }

    async def kill_sandbox(self, sandbox_id: str) -> None:
        """Kill sandbox using remote manager."""
        manager = await self.get_manager()

        logger.info(f"Killing sandbox: {sandbox_id}")

        try:
            await manager.kill_sandbox(sandbox_id)
        finally:
            self._sandboxes.pop(sandbox_id, None)


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
        self.sandbox_manager = get_sandbox_manager()
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
            result = await self.sandbox_manager.list_sandboxes()
            self.write(json.dumps(result))
        else:
            # Get sandbox info
            result = await self.sandbox_manager.get_sandbox_info(sandbox_id)
            self.write(json.dumps(result))
        self.set_header("Content-Type", "application/json")

    @handle_errors
    async def post(self, sandbox_id: Optional[str] = None):
        """Handle POST requests."""
        if sandbox_id is None:
            # Create new sandbox
            try:
                body = json.loads(self.request.body)
                image = body.get('image')
                init_commands = body.get('init_commands')
                env = body.get('env')
            except json.JSONDecodeError as e:
                raise tornado.web.HTTPError(400, f"Invalid JSON in request body: {e}")

            result = await self.sandbox_manager.create_sandbox(
                image=image,
                init_commands=init_commands,
                env=env
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

            result = await self.sandbox_manager.execute_command(sandbox_id, command)
            self.write(json.dumps(result))
            self.set_header("Content-Type", "application/json")

    @handle_errors
    async def delete(self, sandbox_id: Optional[str] = None):
        """Handle DELETE requests."""
        if sandbox_id is None:
            raise tornado.web.HTTPError(404)

        await self.sandbox_manager.kill_sandbox(sandbox_id)
        self.set_status(204)
        self.finish()