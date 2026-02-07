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

# Path to the Claude daemon script (relative to project root)
DAEMON_SCRIPT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../agents/claude/entrypoint.py'))
# Path inside container where the daemon script will be placed
CONTAINER_DAEMON_PATH = "/app/entrypoint.py"
# PID file and socket path inside container
DAEMON_PID_FILE = "/tmp/claude_daemon.pid"
DAEMON_SOCKET_PATH = "/tmp/claude.sock"


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

        # Deploy Claude daemon if type is "claude"
        await self._ensure_daemon_running()

        # Send connected message
        self.write_message(json.dumps({
            'type': 'connected',
            'sandbox_id': sandbox_id
        }))

    async def _ensure_daemon_running(self):
        """Ensure Claude daemon is running in the container (only for type=claude)."""
        # Check if this is a Claude sandbox by reading container labels
        try:
            # For local_docker, we can access container via the handle
            if hasattr(self._handle, '_container'):
                labels = self._handle._container.labels
                sandbox_type = labels.get('type') if labels else None
                if sandbox_type != 'claude':
                    logger.info(f"Sandbox type is '{sandbox_type}', skipping Claude daemon deployment")
                    return
        except Exception as e:
            logger.warning(f"Could not determine sandbox type: {e}, proceeding with daemon check")

        # Check if daemon process is already running (socket exists)
        check_result = await self._handle.execute_command(f"test -S {DAEMON_SOCKET_PATH} && echo 'running' || echo 'not_running'")
        if check_result.exit_code == 0 and 'running' in check_result.output:
            logger.info(f"Claude daemon already running (socket exists)")
            return

        # Daemon not running, deploy it in background (don't block WebSocket)
        logger.info(f"Daemon not running, deploying in background")
        asyncio.create_task(self._deploy_daemon())

    async def _deploy_daemon(self):
        """Deploy Claude daemon script to container and start it."""
        # Read the daemon script from local file
        try:
            with open(DAEMON_SCRIPT_PATH, 'r', encoding='utf-8') as f:
                script_content = f.read()
        except FileNotFoundError:
            logger.error(f"Daemon script not found at {DAEMON_SCRIPT_PATH}")
            return
        except Exception as e:
            logger.error(f"Failed to read daemon script: {e}")
            return

        # Calculate local script hash
        local_hash = hashlib.sha256(script_content.encode()).hexdigest()

        # Check if script exists in container and compare hash
        check_script_result = await self._handle.execute_command(
            f"test -f {CONTAINER_DAEMON_PATH} && sha256sum {CONTAINER_DAEMON_PATH} || echo 'not_found'"
        )

        need_upload = True
        if check_script_result.exit_code == 0 and 'not_found' not in check_script_result.output:
            # Extract remote hash from output (format: "hash  filename")
            parts = check_script_result.output.strip().split()
            if parts:
                remote_hash = parts[0]
                if remote_hash == local_hash:
                    logger.info(f"Script already exists with matching hash, skipping upload")
                    need_upload = False
                else:
                    logger.info(f"Script hash mismatch (local: {local_hash[:12]}..., remote: {remote_hash[:12]}...), updating")

        if need_upload:
            # Use base64 to safely transfer the script content
            encoded_script = base64.b64encode(script_content.encode('utf-8')).decode('ascii')

            # Write script to container (create /app directory first if needed)
            logger.info(f"Uploading daemon script to {CONTAINER_DAEMON_PATH}")
            write_command = f"mkdir -p /app && echo {encoded_script} | base64 -d > {CONTAINER_DAEMON_PATH} && chmod +x {CONTAINER_DAEMON_PATH}"
            write_result = await self._handle.execute_command(write_command)

            if write_result.exit_code != 0:
                logger.error(f"Failed to write daemon script: {write_result.output}")
                return

            logger.info("Daemon script uploaded successfully")

        # Check if daemon process is running before starting
        pid_check_result = await self._handle.execute_command(
            f"pgrep -f '{CONTAINER_DAEMON_PATH}' && echo 'process_exists' || echo 'no_process'"
        )

        if pid_check_result.exit_code == 0 and 'process_exists' in pid_check_result.output:
            logger.info("Daemon process already running, skipping start")
            return

        # Start daemon
        logger.info("Starting daemon process")
        start_command = f"nohup python3 {CONTAINER_DAEMON_PATH} > /tmp/claude_daemon.log 2>&1 & echo 'DAEMON_STARTED'"
        start_result = await self._handle.execute_command(start_command)

        if 'DAEMON_STARTED' not in start_result.output:
            logger.warning(f"Daemon may not have started: {start_result.output}")
        else:
            logger.info("Daemon start command executed")

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
