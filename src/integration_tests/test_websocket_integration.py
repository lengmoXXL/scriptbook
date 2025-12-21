#!/usr/bin/env python3
"""
WebSocket脚本执行集成测试

测试WebSocket端点是否能正常工作，使用TestServer fixture
"""

import asyncio
import json
import websockets
import sys
import pytest
import os


@pytest.mark.asyncio
async def test_websocket_script_execution(test_server):
    """测试WebSocket脚本执行"""
    # 使用test_server的base_url构建WebSocket URL
    base_url = test_server.base_url
    # 将http://替换为ws://
    ws_url = base_url.replace("http://", "ws://") + "/api/scripts/test_script/execute"

    print(f"🔌 连接WebSocket: {ws_url}")
    try:
        # 禁用代理，避免SOCKS代理错误
        os.environ['no_proxy'] = '*'
        os.environ['NO_PROXY'] = '*'
        async with websockets.connect(ws_url, proxy=None) as websocket:
            print("✅ 连接成功")

            # 发送测试脚本
            test_code = "echo 'Hello, World!'\ndate"
            print(f"📤 发送脚本代码: {test_code[:50]}...")
            await websocket.send(json.dumps({"code": test_code}))

            # 接收消息
            message_count = 0
            async for message in websocket:
                message_count += 1
                data = json.loads(message)
                print(f"📨 消息 #{message_count}: [{data['type']}] {data['content'][:60]}")

                # 如果是退出消息，结束测试
                if data['type'] == 'exit':
                    print("✅ 脚本执行完成")
                    break

                # 限制接收消息数量
                if message_count > 20:
                    print("⚠️  接收消息过多，退出")
                    break

    except Exception as e:
        pytest.fail(f"WebSocket测试失败: {e}")


@pytest.mark.asyncio
async def test_websocket_multiple_scripts(test_server):
    """测试多个WebSocket脚本执行"""
    base_url = test_server.base_url
    ws_url = base_url.replace("http://", "ws://") + "/api/scripts/test_script/execute"

    print(f"🔌 连接WebSocket: {ws_url}")
    try:
        # 禁用代理，避免SOCKS代理错误
        os.environ['no_proxy'] = '*'
        os.environ['NO_PROXY'] = '*'
        async with websockets.connect(ws_url, proxy=None) as websocket:
            print("✅ 连接成功")

            # 发送第一个脚本
            test_code1 = "echo 'First script'\necho 'Hello from script 1'"
            await websocket.send(json.dumps({"code": test_code1}))

            # 接收消息直到退出
            exit_received = False
            async for message in websocket:
                data = json.loads(message)
                if data['type'] == 'exit':
                    exit_received = True
                    break

            assert exit_received, "未收到第一个脚本的退出消息"
            print("✅ 第一个脚本执行完成")

    except Exception as e:
        pytest.fail(f"WebSocket多个脚本测试失败: {e}")


if __name__ == "__main__":
    # 直接运行时的行为（向后兼容）
    print("=" * 60)
    print("🧪 WebSocket脚本执行集成测试")
    print("=" * 60)

    # 直接运行时需要手动启动服务器，这很复杂
    print("⚠️  直接运行此脚本需要手动启动服务器")
    print("建议使用: pytest src/integration_tests/test_websocket_integration.py -v")
    sys.exit(1)