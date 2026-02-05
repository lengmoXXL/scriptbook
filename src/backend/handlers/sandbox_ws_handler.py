"""Sandbox WebSocket handler for streaming command execution."""

import asyncio
import json
import logging

import tornado.websocket

from backend.sandbox.manager import get_sandbox_manager
from backend.sandbox.base import ExecutionHandlers, ErrorMessage


logger = logging.getLogger(__name__)


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

        # Send connected message
        self.write_message(json.dumps({
            'type': 'connected',
            'sandbox_id': sandbox_id
        }))

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
