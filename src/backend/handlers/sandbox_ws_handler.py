"""Sandbox WebSocket handler for streaming command execution."""

import asyncio
import base64
import hashlib
import json
import logging
import os
import shlex

import tornado.websocket

from backend.sandbox.manager import get_sandbox_manager
from backend.sandbox.base import ExecutionHandlers, ErrorMessage


logger = logging.getLogger(__name__)

# Daemon configuration: add new types here to extend support
# To add a new daemon type:
# 1. Create entrypoint.py in agents/<type>/entrypoint.py
# 2. Add entry below with socket_path pattern
DAEMON_CONFIGS = {
    "claude": {
        "name": "Claude",
        "script_path": os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../agents/claude/entrypoint.py')),
        "socket_path": "/tmp/claude.sock",
    },
    "iflow": {
        "name": "iFlow",
        "script_path": os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../agents/iflow/entrypoint.py')),
        "socket_path": "/tmp/iflow.sock",
    },
}

# Common paths inside container
CONTAINER_DAEMON_PATH = "/app/entrypoint.py"


class SandboxWebSocketHandler(tornado.websocket.WebSocketHandler):
    """WebSocket handler for streaming command execution in sandbox."""

    def check_origin(self, _origin):
        return True

    async def open(self, sandbox_id: str):
        """Handle WebSocket connection."""
        self.sandbox_id = sandbox_id
        self._handle = None
        logger.info(f"WebSocket opened for sandbox: {sandbox_id}")

        # Get sandbox handle from manager
        try:
            self._handle = await get_sandbox_manager().get_sandbox_handle(sandbox_id)
            logger.info(f"Connected to sandbox: {sandbox_id}")
        except Exception as e:
            logger.error(f"Failed to connect to sandbox: {sandbox_id}, error: {e}")
            self.write_message(json.dumps({
                'type': 'error',
                'error': f'Sandbox not found: {sandbox_id}'
            }))
            self.close()
            return

        # Deploy daemon if sandbox type is configured
        await self._ensure_daemon_running()

        # Send connected message
        self.write_message(json.dumps({
            'type': 'connected',
            'sandbox_id': sandbox_id
        }))

    async def _ensure_daemon_running(self):
        """Ensure daemon is running in the container for configured types."""
        sandbox_type = self._get_sandbox_type()
        if sandbox_type is None or sandbox_type not in DAEMON_CONFIGS:
            logger.info(f"Sandbox type '{sandbox_type}' not in supported types {list(DAEMON_CONFIGS.keys())}, skipping daemon deployment")
            return

        config = DAEMON_CONFIGS[sandbox_type]
        daemon_name = config["name"]
        socket_path = config["socket_path"]

        # Check if daemon process is already running (socket exists)
        check_result = await self._handle.execute_command(f"test -S {socket_path} && echo 'running' || echo 'not_running'")
        if check_result.exit_code == 0 and check_result.output.strip() == 'running':
            logger.info(f"{daemon_name} daemon already running (socket exists)")
            return

        # Daemon not running, deploy it in background (don't block WebSocket)
        logger.info(f"{daemon_name} daemon not running, deploying in background")
        asyncio.create_task(self._deploy_daemon(config))

    def _get_sandbox_type(self) -> str | None:
        """Get sandbox type from container labels."""
        try:
            if hasattr(self._handle, '_container'):
                labels = self._handle._container.labels
                return labels.get('type') if labels else None
        except Exception as e:
            logger.warning(f"Could not determine sandbox type: {e}")
        return None

    async def _deploy_daemon(self, config: dict):
        """Deploy daemon script to container and start it."""
        daemon_name = config["name"]
        script_path = config["script_path"]
        socket_path = config["socket_path"]

        # Read the daemon script from local file
        try:
            with open(script_path, 'r', encoding='utf-8') as f:
                script_content = f.read()
        except FileNotFoundError:
            logger.error(f"{daemon_name} daemon script not found at {script_path}")
            return
        except Exception as e:
            logger.error(f"Failed to read {daemon_name} daemon script: {e}")
            return

        # Calculate local script hash
        local_hash = hashlib.sha256(script_content.encode()).hexdigest()

        # Check if script exists in container and compare hash
        check_script_result = await self._handle.execute_command(
            f"test -f {CONTAINER_DAEMON_PATH} && sha256sum {CONTAINER_DAEMON_PATH} || echo 'not_found'"
        )

        need_upload = True
        if check_script_result.exit_code == 0 and 'not_found' not in check_script_result.output:
            parts = check_script_result.output.strip().split()
            if parts:
                remote_hash = parts[0]
                if remote_hash == local_hash:
                    logger.info(f"{daemon_name} script already exists with matching hash, skipping upload")
                    need_upload = False
                else:
                    logger.info(f"{daemon_name} script hash mismatch (local: {local_hash[:12]}..., remote: {remote_hash[:12]}...), updating")

        if need_upload:
            encoded_script = base64.b64encode(script_content.encode('utf-8')).decode('ascii')
            logger.info(f"Uploading {daemon_name} daemon script to {CONTAINER_DAEMON_PATH}")
            write_command = f"mkdir -p /app && echo {encoded_script} | base64 -d > {CONTAINER_DAEMON_PATH} && chmod +x {CONTAINER_DAEMON_PATH}"
            write_result = await self._handle.execute_command(write_command)

            if write_result.exit_code != 0:
                logger.error(f"Failed to write {daemon_name} daemon script: {write_result.output}")
                return

            logger.info(f"{daemon_name} daemon script uploaded successfully")

        # Check if daemon is already running by testing socket connection
        # Using socket existence as the proxy for process status
        socket_check_result = await self._handle.execute_command(
            f"nc -U -z -w 1 {socket_path} 2>/dev/null && echo 'socket_active' || echo 'socket_inactive'"
        )

        if socket_check_result.exit_code == 0 and socket_check_result.output.strip() == 'socket_active':
            logger.info(f"{daemon_name} daemon socket is active, skipping start")
            return

        # Start daemon
        log_file = f"/tmp/{daemon_name.lower()}_daemon.log"
        logger.info(f"Starting {daemon_name} daemon process")
        start_command = f"nohup python3 {CONTAINER_DAEMON_PATH} > {log_file} 2>&1 & echo 'DAEMON_STARTED'"
        start_result = await self._handle.execute_command(start_command)

        if 'DAEMON_STARTED' not in start_result.output:
            logger.warning(f"{daemon_name} daemon may not have started: {start_result.output}")
        else:
            logger.info(f"{daemon_name} daemon start command executed")

    def on_message(self, message):
        """Handle incoming messages from client."""
        try:
            data = json.loads(message)
            command = data.get('command', '').strip()
            if not command:
                self.write_message(json.dumps({
                    'type': 'error',
                    'error': 'Command is required'
                }))
                return

            # Execute command asynchronously
            asyncio.ensure_future(self.execute_command_streaming(command))
        except json.JSONDecodeError:
            self.write_message(json.dumps({
                'type': 'error',
                'error': 'Invalid JSON message'
            }))
        except Exception as e:
            logger.error(f"Error processing message: {e}")
            self.write_message(json.dumps({
                'type': 'error',
                'error': str(e)
            }))

    async def execute_command_streaming(self, command: str):
        """Execute command with streaming output."""
        if self._handle is None:
            logger.error(f"No sandbox handle for {self.sandbox_id}")
            self.write_message(json.dumps({
                'type': 'error',
                'error': 'Sandbox connection not established'
            }))
            return

        sandbox_id = self.sandbox_id
        logger.info(f"Executing command in sandbox {sandbox_id}: {command}")

        # Store execution result for final done message
        execution_result = {'exit_code': None, 'has_error': False}

        try:
            async def on_stdout(msg):
                self.write_message(json.dumps({
                    'type': 'stdout',
                    'content': msg.text
                }))

            async def on_stderr(msg):
                self.write_message(json.dumps({
                    'type': 'stderr',
                    'content': msg.text
                }))

            async def on_result(msg):
                self.write_message(json.dumps({
                    'type': 'result',
                    'content': msg.text
                }))

            async def on_init(msg):
                self.write_message(json.dumps({
                    'type': 'init',
                    'execution_id': msg.id
                }))

            async def on_complete(msg):
                execution_result['exit_code'] = msg.exit_code
                execution_result['has_error'] = msg.exit_code != 0
                self.write_message(json.dumps({
                    'type': 'complete',
                    'execution_time': msg.execution_time_in_millis,
                    'exit_code': msg.exit_code
                }))

            async def on_error(msg):
                execution_result['has_error'] = True
                execution_result['exit_code'] = 1
                self.write_message(json.dumps({
                    'type': 'error',
                    'error': f"{msg.name}: {msg.value}"
                }))

            handlers = ExecutionHandlers(
                on_stdout=on_stdout,
                on_stderr=on_stderr,
                on_result=on_result,
                on_init=on_init,
                on_execution_complete=on_complete,
                on_error=on_error,
            )

            # Start command execution - handlers will be called in real-time
            await self._handle.execute_command_streaming(command, handlers)

            # Send final done message with exit_code
            final_exit_code = execution_result['exit_code'] if execution_result['exit_code'] is not None else 0
            self.write_message(json.dumps({
                'type': 'done',
                'exit_code': final_exit_code,
                'has_error': final_exit_code != 0
            }))

        except Exception as e:
            logger.error(f"Error executing command: {e}")
            self.write_message(json.dumps({
                'type': 'error',
                'error': str(e)
            }))

    def on_close(self):
        """Handle WebSocket close."""
        logger.info(f"WebSocket closed for sandbox: {self.sandbox_id}")
        self._handle = None

    def on_pong(self, data):
        """Handle pong for connection keep-alive."""
        pass
