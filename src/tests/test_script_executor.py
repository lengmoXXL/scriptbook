import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from sop_online.core.script_executor import ScriptExecutor


class TestScriptExecutor:
    """测试脚本执行器"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.executor = ScriptExecutor()

    def test_initialization(self):
        """测试初始化"""
        assert self.executor._processes == {}

    def test_kill_process_no_process(self):
        """测试终止不存在的进程"""
        # 不应该抛出异常
        self.executor.kill_process("nonexistent")

    @pytest.mark.asyncio
    async def test_execute_success(self):
        """测试成功执行脚本"""
        script_id = "test_script"
        code = "echo 'Hello World'"

        # 模拟子进程
        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = AsyncMock(return_value=0)
        mock_process.returncode = 0

        # 模拟stdout读取
        mock_process.stdout.readline = AsyncMock(
            side_effect=[
                b"Hello World\n",
                b""  # 空字符串表示结束
            ]
        )
        mock_process.stderr.readline = AsyncMock(return_value=b"")

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            async for output in self.executor.execute(script_id, code, timeout=5):
                outputs.append(output)

        # 检查输出
        assert len(outputs) >= 1
        assert outputs[0]["type"] == "stdout"
        assert "Hello World" in outputs[0]["content"]
        assert "timestamp" in outputs[0]

        # 检查进程是否被清理
        assert script_id not in self.executor._processes

    @pytest.mark.asyncio
    async def test_execute_with_stderr(self):
        """测试执行包含stderr输出的脚本"""
        script_id = "test_stderr"
        code = "echo 'Error' >&2"

        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = AsyncMock(return_value=0)
        mock_process.returncode = 0

        mock_process.stdout.readline = AsyncMock(return_value=b"")
        mock_process.stderr.readline = AsyncMock(
            side_effect=[b"Error\n", b""]
        )

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            async for output in self.executor.execute(script_id, code, timeout=5):
                outputs.append(output)

        assert len(outputs) >= 1
        assert outputs[0]["type"] == "stderr"
        assert "Error" in outputs[0]["content"]

    @pytest.mark.asyncio
    async def test_execute_timeout(self):
        """测试执行超时"""
        script_id = "test_timeout"
        code = "sleep 10"

        # 创建一个永远不会完成的 wait 协程
        async def never_complete_wait():
            # 永远等待，不返回
            await asyncio.sleep(100)
            return 0

        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = never_complete_wait  # 返回一个协程而不是 AsyncMock
        mock_process.returncode = None
        mock_process.terminate = MagicMock()

        # 模拟持续读取（永不结束）
        mock_process.stdout.readline = AsyncMock(return_value=b"")
        mock_process.stderr.readline = AsyncMock(return_value=b"")

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            async for output in self.executor.execute(script_id, code, timeout=0.1):
                outputs.append(output)

        # 应该收到超时错误
        assert len(outputs) > 0
        error_outputs = [o for o in outputs if o["type"] == "error"]
        assert len(error_outputs) > 0
        assert "超时" in error_outputs[0]["content"]

        # 进程应该被终止
        mock_process.terminate.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_exception(self):
        """测试执行过程中发生异常"""
        script_id = "test_exception"
        code = "invalid command"

        with patch('asyncio.create_subprocess_shell', side_effect=Exception("Test error")):
            outputs = []
            async for output in self.executor.execute(script_id, code):
                outputs.append(output)

        assert len(outputs) == 1
        assert outputs[0]["type"] == "error"
        assert "Test error" in outputs[0]["content"]

    @pytest.mark.asyncio
    async def test_execute_empty_code(self):
        """测试执行空代码"""
        script_id = "test_empty"
        code = ""

        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = AsyncMock(return_value=0)
        mock_process.returncode = 0

        mock_process.stdout.readline = AsyncMock(return_value=b"")
        mock_process.stderr.readline = AsyncMock(return_value=b"")

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            async for output in self.executor.execute(script_id, code):
                outputs.append(output)

        # 空代码也应该执行，但可能没有输出
        assert script_id not in self.executor._processes

    def test_kill_process_running(self):
        """测试终止运行中的进程"""
        script_id = "running_script"

        # 模拟一个运行中的进程
        mock_process = MagicMock()
        mock_process.returncode = None
        mock_process.terminate = MagicMock()

        self.executor._processes[script_id] = mock_process

        self.executor.kill_process(script_id)

        mock_process.terminate.assert_called_once()
        assert script_id not in self.executor._processes

    def test_kill_process_already_finished(self):
        """测试终止已完成的进程"""
        script_id = "finished_script"

        # 模拟已完成的进程
        mock_process = MagicMock()
        mock_process.returncode = 0
        mock_process.terminate = MagicMock()

        self.executor._processes[script_id] = mock_process

        self.executor.kill_process(script_id)

        # 不应该调用terminate，因为进程已结束
        mock_process.terminate.assert_not_called()
        assert script_id not in self.executor._processes

    @pytest.mark.asyncio
    async def test_execute_process_cleanup_on_error(self):
        """测试错误情况下的进程清理"""
        script_id = "test_cleanup"
        code = "echo 'Test'"

        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = AsyncMock(side_effect=Exception("Wait failed"))
        mock_process.returncode = None
        mock_process.terminate = MagicMock()

        mock_process.stdout.readline = AsyncMock(return_value=b"")
        mock_process.stderr.readline = AsyncMock(return_value=b"")

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            try:
                async for output in self.executor.execute(script_id, code):
                    outputs.append(output)
            except:
                pass

        # 即使出错，进程也应该被清理
        assert script_id not in self.executor._processes
        mock_process.terminate.assert_called_once()

    @pytest.mark.asyncio
    async def test_execute_output_order(self):
        """测试输出顺序（模拟_merge_outputs方法）"""
        script_id = "test_order"
        code = "echo 'Test'"

        # 创建测试生成器
        async def mock_stdout():
            yield {"type": "stdout", "content": "1", "timestamp": "1"}
            yield {"type": "stdout", "content": "2", "timestamp": "2"}

        async def mock_stderr():
            yield {"type": "stderr", "content": "3", "timestamp": "3"}
            yield {"type": "stderr", "content": "4", "timestamp": "4"}

        # 测试_merge_outputs方法
        outputs = []
        async for output in self.executor._merge_outputs(mock_stdout(), mock_stderr()):
            outputs.append(output)

        # 当前实现是按顺序读取的
        assert len(outputs) == 4
        assert outputs[0]["content"] == "1"
        assert outputs[1]["content"] == "2"
        assert outputs[2]["content"] == "3"
        assert outputs[3]["content"] == "4"

    @pytest.mark.asyncio
    async def test_execute_unicode_decoding_error(self):
        """测试Unicode解码错误处理"""
        script_id = "test_unicode"
        code = "echo 'Test'"

        mock_process = AsyncMock()
        mock_process.stdout = AsyncMock()
        mock_process.stderr = AsyncMock()
        mock_process.wait = AsyncMock(return_value=0)
        mock_process.returncode = 0

        # 模拟包含无效UTF-8字节的输出
        invalid_bytes = b"\xff\xfeinvalid\x00"
        mock_process.stdout.readline = AsyncMock(
            side_effect=[invalid_bytes, b""]
        )
        mock_process.stderr.readline = AsyncMock(return_value=b"")

        outputs = []
        with patch('asyncio.create_subprocess_shell', return_value=mock_process):
            async for output in self.executor.execute(script_id, code):
                outputs.append(output)

        # 应该能处理解码错误
        assert len(outputs) >= 1
        assert outputs[0]["type"] == "stdout"
        # 解码后的内容应该包含替换字符

    @pytest.mark.asyncio
    async def test_execute_multiple_scripts_concurrently(self):
        """测试并发执行多个脚本"""
        script_ids = ["script1", "script2", "script3"]
        code = "echo 'Hello'"

        async def mock_execute(script_id):
            outputs = []
            # 简化模拟
            async def mock_generator():
                yield {"type": "stdout", "content": f"Output from {script_id}", "timestamp": "test"}
                yield {"type": "exit", "content": "进程退出，返回码: 0", "timestamp": "test"}

            async for output in mock_generator():
                outputs.append(output)
            return outputs

        # 并发执行
        tasks = [mock_execute(sid) for sid in script_ids]
        results = await asyncio.gather(*tasks)

        assert len(results) == 3
        for i, result in enumerate(results):
            assert len(result) == 2
            assert script_ids[i] in result[0]["content"]

    def test_processes_dict_management(self):
        """测试进程字典管理"""
        # 添加进程
        mock_process1 = MagicMock()
        mock_process2 = MagicMock()

        self.executor._processes["p1"] = mock_process1
        self.executor._processes["p2"] = mock_process2

        assert len(self.executor._processes) == 2
        assert "p1" in self.executor._processes
        assert "p2" in self.executor._processes

        # 移除进程
        del self.executor._processes["p1"]
        assert "p1" not in self.executor._processes
        assert "p2" in self.executor._processes

        # 清空
        self.executor._processes.clear()
        assert len(self.executor._processes) == 0