import asyncio
import pytest
from unittest.mock import MagicMock, patch
from ..core.script_executor import ScriptExecutor


class TestScriptExecutor:
    """测试脚本执行器"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.executor = ScriptExecutor()

    def test_initialization(self):
        """测试初始化"""
        assert self.executor._processes == {}
        assert self.executor._master_fds == {}
        assert self.executor._output_queues == {}

    def test_kill_process_no_process(self):
        """测试终止不存在的进程"""
        # 不应该抛出异常
        self.executor.kill_process("nonexistent")

    def test_kill_process_running(self):
        """测试终止运行中的进程"""
        import os
        script_id = "running_script"

        # 模拟一个运行中的进程
        mock_process = MagicMock()
        mock_process.returncode = None
        mock_process.terminate = MagicMock()

        # 创建真实的 fd
        fd = os.open("/dev/null", os.O_RDWR)

        self.executor._processes[script_id] = mock_process
        self.executor._master_fds[script_id] = fd

        self.executor.kill_process(script_id)

        mock_process.terminate.assert_called_once()
        assert script_id not in self.executor._processes
        assert script_id not in self.executor._master_fds

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
    async def test_wait_for_output(self):
        """测试 _wait_for_output_with_timeout 方法"""
        queue = asyncio.Queue()
        outputs = []

        async def put_outputs():
            await queue.put({"type": "stdout", "content": "1", "timestamp": "1"})
            await queue.put({"type": "stdout", "content": "2", "timestamp": "2"})
            await queue.put(None)  # 结束标记

        # 并发放入输出
        put_task = asyncio.create_task(put_outputs())

        async for output in self.executor._wait_for_output_with_timeout(queue, 5):
            outputs.append(output)

        await put_task

        assert len(outputs) == 2
        assert outputs[0]["content"] == "1"
        assert outputs[1]["content"] == "2"

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

    @pytest.mark.asyncio
    async def test_write_stdin(self):
        """测试 write_stdin 方法"""
        import os
        script_id = "test_stdin"

        # 创建真实的 fd
        fd = os.open("/dev/null", os.O_RDWR)
        self.executor._master_fds[script_id] = fd

        with patch('os.write') as mock_write:
            mock_write.return_value = len("test input")
            self.executor.write_stdin(script_id, "test input")
            mock_write.assert_called_once_with(fd, b"test input")

    @pytest.mark.asyncio
    async def test_write_stdin_no_process(self):
        """测试 write_stdin 对于不存在的进程"""
        # 不应该抛出异常
        self.executor.write_stdin("nonexistent", "test input")

    @pytest.mark.asyncio
    async def test_execute_read_prompt_without_newline(self):
        """测试 read -p 提示符输出（无换行符）"""
        import os
        import pty
        import subprocess

        script_id = "test_read_prompt"
        code = 'read -p "请输入您的名字: " name; echo "您好, $name!"'

        # 创建 PTY
        master_fd, slave_fd = pty.openpty()

        # 启动 bash 脚本
        process = subprocess.Popen(
            ['bash', '-c', code],
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=False
        )
        os.close(slave_fd)

        # 收集输出
        outputs = []
        output_queue = asyncio.Queue()

        # 执行脚本
        async for output in self.executor.execute(
            script_id, code, timeout=5, stdin_queue=output_queue
        ):
            outputs.append(output)

        # 短暂等待让脚本运行
        await asyncio.sleep(0.2)

        # 发送输入
        os.write(master_fd, b'Test\n')
        os.close(master_fd)

        # 等待进程结束
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()

        # 验证输出包含 read -p 提示符
        stdout_outputs = [o for o in outputs if o.get('type') == 'stdout']
        contents = [o.get('content', '') for o in stdout_outputs]

        # 应该包含提示符内容
        assert any('请输入您的名字' in c for c in contents), \
            f"应该包含 read -p 提示符，实际输出: {contents}"

    def test_script_states_initialization(self):
        """测试脚本状态字典初始化"""
        assert hasattr(self.executor, '_script_states')
        assert self.executor._script_states == {}

    def test_output_caches_initialization(self):
        """测试输出缓存字典初始化"""
        assert hasattr(self.executor, '_output_caches')
        assert self.executor._output_caches == {}

    def test_add_to_cache(self):
        """测试添加输出到缓存"""
        script_id = "test_script"
        output1 = {"type": "stdout", "content": "line 1", "timestamp": "1"}
        output2 = {"type": "stdout", "content": "line 2", "timestamp": "2"}

        # 添加第一条输出
        self.executor._add_to_cache(script_id, output1)
        assert script_id in self.executor._output_caches
        assert len(self.executor._output_caches[script_id]) == 1
        assert self.executor._output_caches[script_id][0] == output1

        # 添加第二条输出
        self.executor._add_to_cache(script_id, output2)
        assert len(self.executor._output_caches[script_id]) == 2

    def test_add_to_cache_limit(self):
        """测试缓存大小限制（1000行）"""
        script_id = "test_script_limit"
        limit = 1000

        # 添加超过限制的输出
        for i in range(limit + 100):
            output = {"type": "stdout", "content": f"line {i}", "timestamp": str(i)}
            self.executor._add_to_cache(script_id, output)

        # 验证缓存大小不超过限制
        assert len(self.executor._output_caches[script_id]) == limit
        # 验证保留的是最新的输出
        assert self.executor._output_caches[script_id][0]["content"] == f"line 100"
        assert self.executor._output_caches[script_id][-1]["content"] == f"line {limit + 99}"

    def test_get_all_scripts_empty(self):
        """测试获取正在运行的脚本列表（空）"""
        scripts = self.executor.get_all_scripts()
        assert scripts == []

    def test_get_all_scripts_with_running(self):
        """测试获取所有脚本列表（有运行中的脚本）"""
        script_id1 = "running_script_1"
        script_id2 = "running_script_2"

        # 设置脚本状态
        self.executor._script_states[script_id1] = "running"
        self.executor._script_states[script_id2] = "running"
        self.executor._script_states["completed_script"] = "completed"
        self.executor._script_states["failed_script"] = "failed"

        # 添加一些缓存输出
        self.executor._output_caches[script_id1] = [{"type": "stdout", "content": "line 1"}]
        self.executor._output_caches[script_id2] = [{"type": "stdout", "content": "line 1"}, {"type": "stdout", "content": "line 2"}]

        scripts = self.executor.get_all_scripts()

        assert len(scripts) == 4
        assert scripts[0]["script_id"] == script_id1
        assert scripts[0]["status"] == "running"
        assert scripts[0]["cached_lines"] == 1
        assert scripts[1]["script_id"] == script_id2
        assert scripts[1]["status"] == "running"
        assert scripts[1]["cached_lines"] == 2
        assert scripts[2]["script_id"] == "completed_script"
        assert scripts[2]["status"] == "completed"
        assert scripts[3]["script_id"] == "failed_script"
        assert scripts[3]["status"] == "failed"

    def test_get_script_status_not_found(self):
        """测试获取不存在脚本的状态"""
        status = self.executor.get_script_status("nonexistent")
        assert status is None

    def test_get_script_status_running(self):
        """测试获取正在运行脚本的状态"""
        script_id = "running_script"
        self.executor._script_states[script_id] = "running"
        self.executor._output_caches[script_id] = [
            {"type": "stdout", "content": "line 1"},
            {"type": "stderr", "content": "error line"}
        ]

        status = self.executor.get_script_status(script_id)

        assert status is not None
        assert status["script_id"] == script_id
        assert status["status"] == "running"
        assert len(status["cached_output"]) == 2
        assert status["cached_output"][0]["type"] == "stdout"

    def test_get_script_status_completed(self):
        """测试获取已完成脚本的状态"""
        script_id = "completed_script"
        mock_process = MagicMock()
        mock_process.returncode = 0

        self.executor._script_states[script_id] = "completed"
        self.executor._output_caches[script_id] = [{"type": "stdout", "content": "done"}]
        self.executor._processes[script_id] = mock_process

        status = self.executor.get_script_status(script_id)

        assert status is not None
        assert status["status"] == "completed"
        assert status["exit_code"] == 0

    def test_get_script_status_failed(self):
        """测试获取失败脚本的状态"""
        script_id = "failed_script"
        mock_process = MagicMock()
        mock_process.returncode = 1

        self.executor._script_states[script_id] = "failed"
        self.executor._output_caches[script_id] = [{"type": "stderr", "content": "error"}]
        self.executor._processes[script_id] = mock_process

        status = self.executor.get_script_status(script_id)

        assert status is not None
        assert status["status"] == "failed"
        assert status["exit_code"] == 1

    @pytest.mark.asyncio
    async def test_execute_sets_running_state(self):
        """测试执行脚本时设置运行状态"""
        script_id = "test_state"
        code = "echo 'hello'; exit 0"

        outputs = []
        async for output in self.executor.execute(script_id, code, timeout=5):
            outputs.append(output)

        # 验证状态被设置
        assert script_id in self.executor._script_states
        assert self.executor._script_states[script_id] in ["completed", "failed"]

    @pytest.mark.asyncio
    async def test_execute_caches_output(self):
        """测试执行脚本时缓存输出"""
        script_id = "test_cache"
        code = "echo 'line 1'; echo 'line 2'"

        outputs = []
        async for output in self.executor.execute(script_id, code, timeout=5):
            outputs.append(output)

        # 验证输出被缓存
        assert script_id in self.executor._output_caches
        assert len(self.executor._output_caches[script_id]) > 0

    @pytest.mark.asyncio
    async def test_execute_updates_state_on_completion(self):
        """测试脚本完成后更新状态为 completed"""
        script_id = "test_complete"
        code = "echo 'done'; exit 0"

        outputs = []
        async for output in self.executor.execute(script_id, code, timeout=5):
            outputs.append(output)

        # 验证状态为 completed
        assert self.executor._script_states[script_id] == "completed"

    @pytest.mark.asyncio
    async def test_execute_updates_state_on_failure(self):
        """测试脚本失败时更新状态为 failed"""
        script_id = "test_fail"
        code = "exit 1"

        outputs = []
        async for output in self.executor.execute(script_id, code, timeout=5):
            outputs.append(output)

        # 验证状态为 failed
        assert self.executor._script_states[script_id] == "failed"
