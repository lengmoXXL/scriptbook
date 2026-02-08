#!/usr/bin/env python3
"""
iFlow daemon - Agent Communication Protocol (ACP) 客户端

使用 iFlow SDK 保持会话，通过 Unix socket 接收输入。

启动：python3 entrypoint.py

================================================================================
输出消息 Schema (前端实现参考)
================================================================================

每条消息为一行 JSON，包含 type 字段区分消息类型：

1. SystemMessage (忽略，前端不显示)
   {"type": "SystemMessage", "data": {}}

2. AssistantMessage (显示为 thinking 状态)
   - content 中可能包含: text, thinking, tool_use
   {"type": "AssistantMessage", "content": [
       {"type": "text", "text": "响应内容"}
   ], "model": "iFlow"}

3. UserMessage (工具执行结果，显示到对话框)
   {"type": "UserMessage", "content": [
       {"type": "tool_result", "tool_use_id": "...", "content": "输出内容", "is_error": false}
   ]}

4. ResultMessage (最终结果，显示到对话框)
   {"type": "ResultMessage", "result": "最终文本结果"}

5. Error (错误消息)
   {"type": "Error", "error": "...", "traceback": "..."}

Example:
Input: 1+1等于几
Output:
{"type": "AssistantMessage", "content": [{"type": "text", "text": "1 + 1 = 2"}], "model": "iFlow"}
{"type": "ResultMessage", "result": "1 + 1 = 2"}

================================================================================
"""
import asyncio
import os
import sys
import signal
import json
import traceback
import logging
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

try:
    from iflow_sdk import (
        IFlowClient, IFlowOptions,
        AssistantMessage, TaskFinishMessage,
        ToolCallMessage, ToolConfirmationRequestMessage,
        UserMessage, ErrorMessage, PlanMessage
    )
except ImportError:
    print("iflow-cli-sdk not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "iflow-cli-sdk", "-q"])
    from iflow_sdk import (
        IFlowClient, IFlowOptions,
        AssistantMessage, TaskFinishMessage,
        ToolCallMessage, ToolConfirmationRequestMessage,
        UserMessage, ErrorMessage, PlanMessage
    )


SOCKET_PATH = "/tmp/iflow.sock"
PID_FILE = "/tmp/iflow_daemon.pid"
logger = logging.getLogger(__name__)


class IFlowDaemon:
    def __init__(self):
        self.client = None
        self.running = False
        self.server = None

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """处理客户端连接"""
        try:
            # Read prompt line (similar to Claude daemon)
            data = await reader.readline()
            if not data:
                return

            prompt = data.decode().strip()
            if not prompt:
                return

            logger.info(f"Received prompt: {prompt[:100]}...")

            # Start iFlow client with options
            options = IFlowOptions(
                auto_start_process=True,
                timeout=300.0,
                log_level="INFO"
            )

            async with IFlowClient(options) as iflow_client:
                logger.info("iFlow client connected")

                # Send message to iFlow
                await iflow_client.send_message(prompt)
                logger.info("Message sent to iFlow, waiting for response...")

                # Receive iFlow responses and convert to compatible format
                msg_count = 0
                result_parts = []  # Collect all text for final result
                async for iflow_msg in iflow_client.receive_messages():
                    msg_count += 1

                    # Check if task is finished
                    if isinstance(iflow_msg, TaskFinishMessage):
                        stop_reason = getattr(iflow_msg, 'stop_reason', None)
                        logger.info(f"Task finished. stop_reason: {stop_reason}")
                        break

                    msg_dict = self.serialize_iflow_message(iflow_msg)
                    if msg_dict is None:
                        continue

                    # Collect text from AssistantMessage for final result
                    if msg_dict.get("type") == "AssistantMessage":
                        for block in msg_dict.get("content", []):
                            if block.get("type") == "text":
                                result_parts.append(block["text"])

                    json_line = json.dumps(msg_dict, ensure_ascii=False) + "\n"
                    writer.write(json_line.encode())
                    await writer.drain()

                logger.info(f"Finished receiving messages. Total: {msg_count}")
                # Send final result message with collected text
                final_result = "".join(result_parts).strip() if result_parts else "Task completed"
                writer.write(json.dumps({"type": "ResultMessage", "result": final_result}, ensure_ascii=False).encode() + b"\n")
                await writer.drain()

        except Exception as e:
            error_msg = json.dumps({"type": "Error", "error": str(e), "traceback": traceback.format_exc()}, ensure_ascii=False) + "\n"
            writer.write(error_msg.encode())
            await writer.drain()
            logger.error(f"Error handling client: {e}", exc_info=True)
        finally:
            writer.close()
            await writer.wait_closed()

    def serialize_iflow_message(self, msg):
        """将 iFlow SDK 消息序列化为与 Claude daemon 兼容的 JSON 格式"""
        # AssistantMessage - 流式文本响应
        if isinstance(msg, AssistantMessage):
            return {
                "type": "AssistantMessage",
                "content": [{"type": "text", "text": msg.chunk.text}],
                "model": "iFlow"
            }

        # ToolCallMessage - 工具调用（参数在 ToolResultMessage 中）
        elif isinstance(msg, ToolCallMessage):
            # ToolCallMessage doesn't have parameters - parameters come in ToolResultMessage
            # We don't output anything here, waiting for ToolResultMessage with actual params
            return None

        # ToolConfirmationRequestMessage - 工具确认请求
        elif isinstance(msg, ToolConfirmationRequestMessage):
            tool_call_id = str(getattr(msg, 'tool_call_id', ''))
            tool_name = getattr(msg, 'tool_name', 'unknown')
            arguments = getattr(msg, 'arguments', {})

            return {
                "type": "AssistantMessage",
                "content": [{
                    "type": "tool_use",
                    "id": tool_call_id,
                    "name": tool_name,
                    "input": arguments if self._is_json_serializable(arguments) else {}
                }],
                "model": "iFlow"
            }

        # UserMessage - 用户消息（通常不需要输出到前端）
        elif isinstance(msg, UserMessage):
            return {
                "type": "UserMessage",
                "content": [{"type": "text", "text": getattr(msg, 'text', str(msg))}]
            }

        # ErrorMessage - 错误消息
        elif isinstance(msg, ErrorMessage):
            return {
                "type": "Error",
                "error": getattr(msg, 'message', str(msg))
            }

        # PlanMessage - 计划消息
        elif isinstance(msg, PlanMessage):
            return {
                "type": "AssistantMessage",
                "content": [{
                    "type": "thinking",
                    "thinking": getattr(msg, 'content', str(msg)),
                    "signature": ""
                }],
                "model": "iFlow"
            }

        # TaskFinishMessage - 任务完成（用于退出循环，不输出）
        elif isinstance(msg, TaskFinishMessage):
            return None

        # ToolResultMessage - 工具执行结果（这里包含实际的工具参数！）
        elif type(msg).__name__ == 'ToolResultMessage':
            tool_id = getattr(msg, 'id', '')
            tool_name = getattr(msg, 'tool_name', 'unknown')
            status = getattr(msg, 'status', None)

            # Extract args from ToolResultMessage - this is where the actual parameters are!
            args = getattr(msg, 'args', None)
            content = getattr(msg, 'content', None)

            # Check if status is COMPLETED (use .value to get the string value)
            is_completed = hasattr(status, 'value') and status.value == 'completed'
            is_in_progress = hasattr(status, 'value') and status.value == 'in_progress'

            # For completed tool calls, send tool_use with parameters first
            if is_completed and (args or content):
                arguments = {}

                # Extract from args dict
                if args and isinstance(args, dict):
                    arguments = {k: v for k, v in args.items() if self._is_json_serializable(v)}

                # Also extract from content if available
                elif content is not None:
                    content_type = getattr(content, 'type', None)
                    path = getattr(content, 'path', None)
                    new_text = getattr(content, 'new_text', None)
                    markdown = getattr(content, 'markdown', None)

                    if path:
                        arguments['path'] = path
                    if new_text:
                        arguments['new_text'] = new_text
                    if markdown:
                        arguments['markdown'] = markdown

                # Return tool_use message with actual parameters
                return {
                    "type": "AssistantMessage",
                    "content": [{
                        "type": "tool_use",
                        "id": str(tool_id),
                        "name": tool_name,
                        "input": arguments
                    }],
                    "model": "iFlow"
                }

            # For in_progress tool calls, send a loading indicator
            elif is_in_progress:
                return {
                    "type": "AssistantMessage",
                    "content": [{
                        "type": "tool_use",
                        "id": str(tool_id),
                        "name": tool_name,
                        "input": {"status": "running"}
                    }],
                    "model": "iFlow"
                }

            # Don't output for other statuses
            return None

        # 其他消息类型暂时忽略
        else:
            logger.debug(f"Unhandled message type: {type(msg)}")
            return None

    def _is_json_serializable(self, value):
        """Check if a value can be JSON serialized"""
        try:
            json.dumps(value)
            return True
        except (TypeError, ValueError):
            return False

    async def run(self):
        """主循环"""
        self.running = True

        if os.path.exists(SOCKET_PATH):
            os.remove(SOCKET_PATH)

        print(f"[INFO] iFlow daemon started (PID: {os.getpid()})", flush=True)
        print(f"[INFO] Socket: {SOCKET_PATH}", flush=True)

        self.server = await asyncio.start_unix_server(
            self.handle_client,
            path=SOCKET_PATH
        )
        os.chmod(SOCKET_PATH, 0o777)

        async with self.server:
            await self.server.serve_forever()


async def main():
    daemon = IFlowDaemon()

    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )

    with open(PID_FILE, 'w') as f:
        f.write(str(os.getpid()))

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda: setattr(daemon, 'running', False))

    try:
        await daemon.run()
    finally:
        if daemon.server:
            daemon.server.close()
            await daemon.server.wait_closed()
        if os.path.exists(PID_FILE):
            os.remove(PID_FILE)
        if os.path.exists(SOCKET_PATH):
            os.remove(SOCKET_PATH)


if __name__ == '__main__':
    import sys
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...", flush=True)

