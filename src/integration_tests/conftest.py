"""
集成测试公共配置和fixture

提供服务器管理和其他公共工具
"""
import subprocess
import time
import os
import pytest
import requests
from pathlib import Path


class TestServer:
    """测试服务器管理器"""

    def __init__(self, content_dir: str, port: int = 8000):
        self.content_dir = content_dir
        self.port = port
        self.process = None
        self.base_url = f"http://127.0.0.1:{port}"

    def start(self):
        """启动服务器"""
        print(f"\n🚀 启动服务器 (端口: {self.port})...")

        # 获取scriptbook命令的完整路径
        try:
            result = subprocess.run(
                ["which", "scriptbook"],
                capture_output=True,
                text=True,
                timeout=5
            )
            if result.returncode == 0:
                scriptbook_cmd = result.stdout.strip()
            else:
                # 如果which失败，使用默认路径
                venv_path = Path(__file__).parent.parent / ".venv" / "bin" / "scriptbook"
                scriptbook_cmd = str(venv_path)
        except Exception:
            # 使用默认路径
            venv_path = Path(__file__).parent.parent / ".venv" / "bin" / "scriptbook"
            scriptbook_cmd = str(venv_path)

        cmd = [
            scriptbook_cmd,
            self.content_dir,
            "--port", str(self.port),
            "--host", "127.0.0.1"
        ]

        print(f"  命令: {' '.join(cmd)}")

        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            env={**os.environ, "PATH": f"{Path(scriptbook_cmd).parent}:{os.environ.get('PATH', '')}"}
        )

        # 等待服务器启动
        max_attempts = 30
        for i in range(max_attempts):
            try:
                response = requests.get(f"{self.base_url}/health", timeout=1)
                if response.status_code == 200:
                    print(f"✅ 服务器启动成功 (尝试 {i+1}/{max_attempts})")
                    return True
            except requests.exceptions.RequestException:
                time.sleep(0.5)

        print(f"❌ 服务器启动失败")
        return False

    def stop(self):
        """停止服务器"""
        if self.process:
            print(f"\n🛑 停止服务器...")
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
                print(f"✅ 服务器已停止")
            except subprocess.TimeoutExpired:
                self.process.kill()
                print(f"✅ 服务器已强制停止")


@pytest.fixture(scope="session")
def test_server():
    """会话级fixture，管理测试服务器生命周期

    服务器在整个测试会话中只启动一次，使用端口8015
    """
    server = TestServer("content", port=8015)

    # 启动服务器
    if not server.start():
        pytest.fail("无法启动测试服务器")

    yield server

    # 清理：停止服务器
    server.stop()


@pytest.fixture(scope="session")
def test_server_8016():
    """会话级fixture，管理测试服务器生命周期（端口8016）

    用于需要独立服务器的测试
    """
    server = TestServer("content", port=8016)

    # 启动服务器
    if not server.start():
        pytest.fail("无法启动测试服务器")

    yield server

    # 清理：停止服务器
    server.stop()
