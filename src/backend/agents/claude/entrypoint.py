#!/usr/bin/env python3
"""
Claude daemon - 持久会话管理器

使用 Claude Agent SDK 保持会话，通过 Unix socket 接收输入。

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
Input: 计算100个素数
Output:
{"type": "progress", "content": "用户要求计算100个素数。这是一个计算任务，我可以使用Python来完成。"}
{"type": "progress", "content": "### Bash\n\n```bash\npython3 << 'EOF'\n# 计算100个素数\nprint([2, 3, 5, 7, 11])\nEOF\n```"}
{"type": "progress", "content": "```\n[2, 3, 5, 7, 11]\n```"}
{"type": "progress", "content": "已完成！计算出了前100个素数。"}

================================================================================
"""
import asyncio
import os
import signal
import json
import traceback
from claude_agent_sdk import (
    AssistantMessage,
    UserMessage,
    TextBlock,
    ThinkingBlock,
    ToolUseBlock,
    ToolResultBlock,
    ResultMessage,
    SystemMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
)


def block_to_markdown(block) -> str:
    """将内容块转换为 markdown 格式"""
    if isinstance(block, TextBlock):
        return block.text
    elif isinstance(block, ThinkingBlock):
        return block.thinking
    elif isinstance(block, ToolUseBlock):
        input_obj = block.input if isinstance(block.input, dict) else {}
        # Bash 工具
        if block.name == "Bash":
            cmd = input_obj.get("command", "")
            return f"### Bash\n\n```bash\n{cmd}\n```"
        # Read 工具
        elif block.name == "Read":
            path = input_obj.get("file_path", "")
            return f"### Read\n\n```\n{path}\n```"
        # Write 工具
        elif block.name == "Write":
            path = input_obj.get("file_path", "")
            content = input_obj.get("content", "")
            return f"### Write\n\n```\n{path}\n```\n\n```{get_lang(path)}\n{content}\n```"
        else:
            return f"### {block.name}\n\n```json\n{json.dumps(input_obj, ensure_ascii=False)}\n```"
    elif isinstance(block, ToolResultBlock):
        content = block.content if isinstance(block.content, str) else ""
        is_error = getattr(block, 'is_error', False)
        prefix = "❌ " if is_error else ""
        return f"{prefix}```\n{content}\n```"
    else:
        return str(block)


def get_lang(path: str) -> str:
    """根据文件路径获取语言标识"""
    ext = path.rsplit(".", 1)[-1].lower()
    lang_map = {
        "py": "python", "js": "javascript", "ts": "typescript",
        "vue": "vue", "html": "html", "css": "css", "json": "json",
        "md": "markdown", "yaml": "yaml", "yml": "yaml", "sh": "bash"
    }
    return lang_map.get(ext, "")


SOCKET_PATH = "/tmp/claude.sock"
PID_FILE = "/tmp/claude_daemon.pid"


def serialize_message(msg):
    """将 SDK 消息序列化为简化格式"""
    if isinstance(msg, SystemMessage):
        return None

    content_parts = []

    if isinstance(msg, AssistantMessage):
        for block in msg.content:
            md = block_to_markdown(block)
            if md:
                content_parts.append(md)
        if content_parts:
            return {"type": "progress", "content": "\n\n".join(content_parts)}
        return None

    elif isinstance(msg, UserMessage):
        for block in msg.content:
            md = block_to_markdown(block)
            if md:
                content_parts.append(md)
        if content_parts:
            return {"type": "progress", "content": "\n\n".join(content_parts)}
        return None

    elif isinstance(msg, ResultMessage):
        result = getattr(msg, 'result', None)
        # Check if result contains error indicators
        is_error = result and ('error' in result.lower() or 'failed' in result.lower() or 'exception' in result.lower())
        return {"type": "finish", "success": not is_error}

    return None


class ClaudeDaemon:
    def __init__(self):
        self.client = None
        self.running = False
        self.server = None

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        """处理客户端连接"""
        try:
            data = await reader.readline()
            if not data:
                return

            prompt = data.decode().strip()
            if not prompt:
                return

            if self.client is None:
                finish_msg = json.dumps({"type": "finish", "success": False, "content": "Client not initialized"}, ensure_ascii=False) + "\n"
                writer.write(finish_msg.encode())
                await writer.drain()
                return

            await self.client.query(prompt)

            async for msg in self.client.receive_response():
                msg_dict = serialize_message(msg)
                if msg_dict is None:
                    continue
                json_line = json.dumps(msg_dict, ensure_ascii=False) + "\n"
                writer.write(json_line.encode())
                await writer.drain()

        except Exception as e:
            error_content = f"### Error\n\n```\n{str(e)}\n```\n\n```\n{traceback.format_exc()}\n```"
            finish_msg = json.dumps({"type": "finish", "success": False, "content": error_content}, ensure_ascii=False) + "\n"
            writer.write(finish_msg.encode())
            await writer.drain()
        finally:
            writer.close()
            await writer.wait_closed()

    async def run(self):
        """主循环"""
        self.running = True

        if os.path.exists(SOCKET_PATH):
            os.remove(SOCKET_PATH)

        options = ClaudeAgentOptions(
            allowed_tools=["Read", "Write", "Bash"],
            permission_mode='acceptEdits',
        )

        async with ClaudeSDKClient(options=options) as client:
            self.client = client
            print(f"[INFO] Claude daemon started (PID: {os.getpid()})", flush=True)
            print(f"[INFO] Socket: {SOCKET_PATH}", flush=True)

            self.server = await asyncio.start_unix_server(
                self.handle_client,
                path=SOCKET_PATH
            )
            os.chmod(SOCKET_PATH, 0o777)

            async with self.server:
                await self.server.serve_forever()


async def main():
    daemon = ClaudeDaemon()

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
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[INFO] Shutting down...", flush=True)
