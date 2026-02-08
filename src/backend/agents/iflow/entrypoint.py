#!/usr/bin/env python3
"""
iFlow daemon - Agent Communication Protocol (ACP) 客户端

使用 iFlow SDK 保持会话，通过 Unix socket 接收输入。

启动：python3 entrypoint.py

================================================================================
输出消息 Schema
================================================================================

每条消息为一行 JSON，包含 type 和 content 字段：

1. progress (过程信息)
   {"type": "progress", "content": "markdown 内容"}

2. finish (结束标识)
   {"type": "finish", "success": true/false}

   如果 success 为 false，可以包含 content 字段显示错误信息：
   {"type": "finish", "success": false, "content": "markdown 格式的错误信息"}

Example:
Input: 1+1等于几
Output:
{"type": "progress", "content": "正在计算..."}
{"type": "progress", "content": "1 + 1 = 2"}

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
                        # Send finish message
                        is_success = stop_reason is None or stop_reason in ['end_turn', 'stop']
                        finish_msg = json.dumps({"type": "finish", "success": is_success}, ensure_ascii=False) + "\n"
                        writer.write(finish_msg.encode())
                        await writer.drain()
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

        except Exception as e:
            error_content = f"### Error\n\n```\n{str(e)}\n```\n\n```\n{traceback.format_exc()}\n```"
            finish_msg = json.dumps({"type": "finish", "success": False, "content": error_content}, ensure_ascii=False) + "\n"
            writer.write(finish_msg.encode())
            await writer.drain()
            logger.error(f"Error handling client: {e}", exc_info=True)
        finally:
            writer.close()
            await writer.wait_closed()

    def serialize_iflow_message(self, msg):
        """将 iFlow SDK 消息序列化为简化格式"""
        # AssistantMessage - 流式文本响应
        if isinstance(msg, AssistantMessage):
            return {"type": "progress", "content": msg.chunk.text}

        # ToolCallMessage - 工具调用（参数在 ToolResultMessage 中）
        elif isinstance(msg, ToolCallMessage):
            return None

        # ToolConfirmationRequestMessage - 工具确认请求
        elif isinstance(msg, ToolConfirmationRequestMessage):
            tool_name = getattr(msg, 'tool_name', 'unknown')
            arguments = getattr(msg, 'arguments', {})
            return {"type": "progress", "content": self._tool_use_to_markdown(tool_name, arguments)}

        # UserMessage - 用户消息（通常不需要输出到前端）
        elif isinstance(msg, UserMessage):
            return None

        # ErrorMessage - 错误消息（作为进度消息显示）
        elif isinstance(msg, ErrorMessage):
            return {"type": "progress", "content": f"### Error\n\n```\n{getattr(msg, 'message', str(msg))}\n```"}

        # PlanMessage - 计划消息
        elif isinstance(msg, PlanMessage):
            return {"type": "progress", "content": getattr(msg, 'content', str(msg))}

        # TaskFinishMessage - 任务完成（用于退出循环，不输出）
        elif isinstance(msg, TaskFinishMessage):
            return None

        # ToolResultMessage - 工具执行结果
        elif type(msg).__name__ == 'ToolResultMessage':
            tool_name = getattr(msg, 'tool_name', 'unknown')
            status = getattr(msg, 'status', None)
            args = getattr(msg, 'args', None)
            content = getattr(msg, 'content', None)

            is_completed = hasattr(status, 'value') and status.value == 'completed'
            is_in_progress = hasattr(status, 'value') and status.value == 'in_progress'

            # For completed tool calls, send tool_use with parameters
            if is_completed and (args or content):
                arguments = {}
                if args and isinstance(args, dict):
                    arguments = {k: v for k, v in args.items() if self._is_json_serializable(v)}
                elif content is not None:
                    path = getattr(content, 'path', None)
                    new_text = getattr(content, 'new_text', None)
                    if path:
                        arguments['path'] = path
                    if new_text:
                        arguments['new_text'] = new_text

                return {"type": "progress", "content": self._tool_use_to_markdown(tool_name, arguments)}

            # For in_progress tool calls
            elif is_in_progress:
                return {"type": "progress", "content": f"### {tool_name}\n\n执行中..."}

            return None

        # 其他消息类型暂时忽略
        else:
            logger.debug(f"Unhandled message type: {type(msg)}")
            return None

    def _tool_use_to_markdown(self, tool_name: str, arguments: dict) -> str:
        """将工具调用转换为 markdown 格式"""
        if tool_name == "bash" or tool_name == "Bash":
            cmd = arguments.get("command", "")
            return f"### Bash\n\n```bash\n{cmd}\n```"
        elif tool_name == "read" or tool_name == "Read":
            path = arguments.get("file_path", arguments.get("path", ""))
            return f"### Read\n\n```\n{path}\n```"
        elif tool_name == "write" or tool_name == "Write":
            path = arguments.get("file_path", arguments.get("path", ""))
            text = arguments.get("text", arguments.get("new_text", ""))
            return f"### Write\n\n```\n{path}\n```\n\n```{self._get_lang(path)}\n{text}\n```"
        else:
            return f"### {tool_name}\n\n```json\n{json.dumps(arguments, ensure_ascii=False)}\n```"

    def _get_lang(self, path: str) -> str:
        """根据文件路径获取语言标识"""
        ext = path.rsplit(".", 1)[-1].lower() if "." in path else ""
        lang_map = {
            "py": "python", "js": "javascript", "ts": "typescript",
            "vue": "vue", "html": "html", "css": "css", "json": "json",
            "md": "markdown", "yaml": "yaml", "yml": "yaml", "sh": "bash"
        }
        return lang_map.get(ext, "")

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

