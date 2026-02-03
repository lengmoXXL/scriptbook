#!/usr/bin/env python3
"""
Claude daemon - 持久会话管理器

使用 Claude Agent SDK 保持会话，通过 Unix socket 接收输入。

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
       {"type": "tool_use", "id": "...", "name": "Bash", "input": {...}}
   ], "model": "..."}

3. UserMessage (工具执行结果，显示到对话框)
   {"type": "UserMessage", "content": [
       {"type": "tool_result", "tool_use_id": "...", "content": "输出内容", "is_error": false}
   ]}

4. ResultMessage (最终结果，显示到对话框)
   {"type": "ResultMessage", "result": "最终文本结果"}

5. Error (错误消息)
   {"type": "Error", "error": "...", "traceback": "..."}

Example:
Input: 计算100个素数
Oputput:
{"type": "SystemMessage", "data": {}}
{"type": "AssistantMessage", "content": [{"type": "thinking", "thinking": "用户要求计算100个素数。这是一个计算任务，我可以使用Python来完成。我需要生成前100个素数。\n\n素数是指大于1的自然数，且只能被1和自身整除的数。\n\n我会写一个Python脚本来计算前100个素数。", "signature": "eacccf437c17dfbbf648f88b0c820ff6b30de1dddd804168a230c0bb514d45f1"}], "model": "MiniMax-M2.1"}
{"type": "AssistantMessage", "content": [{"type": "tool_use", "id": "call_function_967uthn412zg_1", "name": "Bash", "input": {"command": "python3 << 'EOF'\n# 计算100个素数\n\ndef is_prime(n):\n    \"\"\"判断一个数是否为素数\"\"\"\n    if n < 2:\n        return False\n    if n == 2:\n        return True\n    if n % 2 == 0:\n        return False\n    # 检查到平方根\n    i = 3\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 2\n    return True\n\n# 计算前100个素数\nprimes = []\nnum = 2\nwhile len(primes) < 100:\n    if is_prime(num):\n        primes.append(num)\n    num += 1\n\n# 每10个一行输出\nprint(\"前100个素数：\")\nfor i in range(0, 100, 10):\n    print(primes[i:i+10])\n    \nprint(f\"\\n第100个素数是: {primes[-1]}\")\nEOF", "description": "计算并显示前100个素数"}}], "model": "MiniMax-M2.1"}
{"type": "UserMessage", "content": [{"type": "tool_result", "tool_use_id": "call_function_967uthn412zg_1", "content": "前100个素数：\n[2, 3, 5, 7, 11, 13, 17, 19, 23, 29]\n[31, 37, 41, 43, 47, 53, 59, 61, 67, 71]\n[73, 79, 83, 89, 97, 101, 103, 107, 109, 113]\n[127, 131, 137, 139, 149, 151, 157, 163, 167, 173]\n[179, 181, 191, 193, 197, 199, 211, 223, 227, 229]\n[233, 239, 241, 251, 257, 263, 269, 271, 277, 281]\n[283, 293, 307, 311, 313, 317, 331, 337, 347, 349]\n[353, 359, 367, 373, 379, 383, 389, 397, 401, 409]\n[419, 421, 431, 433, 439, 443, 449, 457, 461, 463]\n[467, 479, 487, 491, 499, 503, 509, 521, 523, 541]\n\n第100个素数是: 541", "is_error": false}]}
{"type": "AssistantMessage", "content": [{"type": "thinking", "thinking": "成功计算出了前100个素数，并按每行10个的格式输出。第100个素数是541。", "signature": "02b32e1e82bf3a37810f13191fefc084e6263693946a8f33eaa546fdfa6040c8"}], "model": "MiniMax-M2.1"}
{"type": "AssistantMessage", "content": [{"type": "text", "text": "已完成！计算出了前100个素数，结果如上所示。**第100个素数是 541**。\n\n素数从2开始（前几个素数：2, 3, 5, 7, 11, 13, 17...），一直到第100个素数541。"}], "model": "MiniMax-M2.1"}
{"type": "ResultMessage", "result": "已完成！计算出了前100个素数，结果如上所示。**第100个素数是 541**。\n\n素数从2开始（前几个素数：2, 3, 5, 7, 11, 13, 17...），一直到第100个素数541。"}

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


def serialize_block(block):
    """将内容块序列化为 JSON 兼容的字典"""
    if isinstance(block, TextBlock):
        return {"type": "text", "text": block.text}
    elif isinstance(block, ThinkingBlock):
        return {
            "type": "thinking",
            "thinking": block.thinking,
            "signature": block.signature
        }
    elif isinstance(block, ToolUseBlock):
        return {
            "type": "tool_use",
            "id": block.id,
            "name": block.name,
            "input": block.input
        }
    elif isinstance(block, ToolResultBlock):
        content = ""
        if isinstance(block.content, str):
            content = block.content
        elif isinstance(block.content, dict):
            content = {}
            for k, v in block.content.items():
                content[k] = v
        return {
            "type": "tool_result",
            "tool_use_id": getattr(block, 'tool_use_id', None),
            "content": content,
            "is_error": getattr(block, 'is_error', False)
        }
    else:
        return {
            "type": "unknown",
            "data": str(type(block))
        }


SOCKET_PATH = "/tmp/claude.sock"
PID_FILE = "/tmp/claude_daemon.pid"


def serialize_message(msg):
    """将 SDK 消息序列化为 JSON 兼容的字典"""
    result = {"type": msg.__class__.__name__}

    if isinstance(msg, AssistantMessage):
        result["content"] = [serialize_block(block) for block in msg.content]
        result["model"] = msg.model
    elif isinstance(msg, UserMessage):
        result["content"] = [serialize_block(block) for block in msg.content]
    elif isinstance(msg, ResultMessage):
        result["result"] = getattr(msg, 'result', None)
    elif isinstance(msg, SystemMessage):
        result["data"] = {}
    else:
        return None

    return result


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
                error_msg = json.dumps({"error": "Client not initialized"}, ensure_ascii=False) + "\n"
                writer.write(error_msg.encode())
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
            error_msg = json.dumps({"error": str(e), "traceback": traceback.format_exc()}, ensure_ascii=False) + "\n"
            writer.write(error_msg.encode())
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
