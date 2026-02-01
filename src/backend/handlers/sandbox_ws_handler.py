#!/usr/bin/env python3
"""
Sandbox WebSocket handler for streaming command execution.
Each handler maintains its own sandbox connection.
"""

import asyncio
import json
import logging

import tornado.websocket
from opensandbox import Sandbox
from opensandbox.config import ConnectionConfig
from opensandbox.models.execd import ExecutionHandlers, OutputMessage

logger = logging.getLogger(__name__)


def get_connection_config() -> ConnectionConfig:
    """Get connection config for OpenSandbox."""
    return ConnectionConfig(domain="localhost:8081")


class SandboxWebSocketHandler(tornado.websocket.WebSocketHandler):
    """WebSocket handler for streaming command execution in sandbox."""

    def check_origin(self, _origin):
        return True

    async def open(self, sandbox_id: str):
        """Handle WebSocket connection."""
        self.sandbox_id = sandbox_id
        self._sandbox: Sandbox | None = None
        logger.info(f"WebSocket opened for sandbox: {sandbox_id}")

        # Connect to sandbox
        try:
            self._sandbox = await Sandbox.connect(sandbox_id, get_connection_config())
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
        if self._sandbox is None:
            logger.error(f"No sandbox connection for {self.sandbox_id}")
            self.write_message(json.dumps({
                'type': 'error',
                'error': 'Sandbox connection not established'
            }))
            return

        sandbox_id = self.sandbox_id
        logger.info(f"Executing command in sandbox {sandbox_id}: {command}")

        try:
            # Directly send WebSocket messages in handlers for real-time streaming
            async def on_stdout(msg: OutputMessage):
                self.write_message(json.dumps({
                    'type': 'stdout',
                    'content': msg.text
                }))

            async def on_stderr(msg: OutputMessage):
                self.write_message(json.dumps({
                    'type': 'stderr',
                    'content': msg.text
                }))

            async def on_result(msg: OutputMessage):
                self.write_message(json.dumps({
                    'type': 'result',
                    'content': msg.text
                }))

            async def on_init(msg):
                self.write_message(json.dumps({
                    'type': 'init',
                    'execution_id': msg.id if hasattr(msg, 'id') else None
                }))

            async def on_complete(msg):
                self.write_message(json.dumps({
                    'type': 'complete',
                    'execution_time': msg.execution_time_in_millis if hasattr(msg, 'execution_time_in_millis') else None
                }))

            async def on_error(msg):
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
            execution = await self._sandbox.commands.run(command, handlers=handlers)

            # Send final result with exit code
            exit_code = 1 if execution.error else 0
            self.write_message(json.dumps({
                'type': 'done',
                'exit_code': exit_code,
                'has_error': execution.error is not None
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
        self._sandbox = None

    def on_pong(self, data):
        """Handle pong for connection keep-alive."""
        pass
