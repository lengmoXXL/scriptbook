import asyncio
import os
import pty
from typing import AsyncGenerator, Dict, Any, Optional
from datetime import datetime


def _timestamp() -> str:
    """生成ISO格式的时间戳"""
    return datetime.now().isoformat()


class ScriptExecutor:
    """脚本执行器，用于执行bash脚本，支持 PTY 和交互式输入"""

    def __init__(self):
        self._processes: Dict[str, asyncio.subprocess.Process] = {}
        self._master_fds: Dict[str, int] = {}
        self._output_queues: Dict[str, asyncio.Queue] = {}
        self._script_states: Dict[str, str] = {}  # 脚本状态: running/completed/failed
        self._output_caches: Dict[str, list] = {}  # 输出缓存

    async def _cleanup(
        self,
        script_id: str,
        process: Optional[asyncio.subprocess.Process],
        read_task: Optional[asyncio.Task],
        stdin_task: Optional[asyncio.Task],
    ):
        """清理资源"""
        # 取消任务
        if read_task:
            read_task.cancel()
        if stdin_task:
            stdin_task.cancel()

        # 等待任务完成
        tasks_to_wait = []
        if read_task:
            tasks_to_wait.append(read_task)
        if stdin_task:
            tasks_to_wait.append(stdin_task)
        for task in tasks_to_wait:
            try:
                await task
            except asyncio.CancelledError:
                pass

        # 清理 PTY fd
        if script_id in self._master_fds:
            try:
                os.close(self._master_fds[script_id])
            except OSError:
                pass
            del self._master_fds[script_id]

        # 清理输出队列
        if script_id in self._output_queues:
            del self._output_queues[script_id]

        # 等待进程结束
        if process:
            try:
                if process.returncode is None:
                    process.terminate()
                    await asyncio.wait_for(process.wait(), timeout=1)
            except (asyncio.TimeoutError, ProcessLookupError):
                pass
            except Exception:
                pass

            # 从进程字典中移除
            if script_id in self._processes:
                del self._processes[script_id]

    async def _wait_for_output_with_timeout(
        self,
        queue: asyncio.Queue,
        timeout: int
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """从队列中异步获取输出，支持超时"""
        while True:
            try:
                # 使用 wait_for 实现超时
                output = await asyncio.wait_for(queue.get(), timeout=timeout)
            except asyncio.TimeoutError:
                raise asyncio.TimeoutError(f"等待输出超时 ({timeout}秒)")

            if output is None:
                break
            yield output

    async def execute(
        self,
        script_id: str,
        code: str,
        timeout: int = 1800,  # 默认30分钟
        stdin_queue: Optional[asyncio.Queue] = None
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        异步执行bash脚本

        Args:
            script_id: 脚本ID
            code: 脚本代码
            timeout: 超时时间（秒）
            stdin_queue: 可选的输入队列，用于交互式输入

        Yields:
            输出消息字典，包含type, content, timestamp
        """
        # 彻底清理该脚本的旧状态（每次执行都是新的开始）
        if script_id in self._output_caches:
            del self._output_caches[script_id]
        if script_id in self._script_states:
            del self._script_states[script_id]
        if script_id in self._processes:
            try:
                process = self._processes[script_id]
                if process.returncode is None:
                    process.terminate()
                del self._processes[script_id]
            except Exception:
                pass
        if script_id in self._master_fds:
            try:
                os.close(self._master_fds[script_id])
            except OSError:
                pass
            del self._master_fds[script_id]

        process = None
        output_queue = asyncio.Queue()
        self._output_queues[script_id] = output_queue
        read_task = None
        stdin_task = None
        timed_out = False

        try:
            # 创建 PTY
            master_fd, slave_fd = pty.openpty()

            # 创建子进程，将 PTY 作为 stdin/stdout/stderr
            process = await asyncio.create_subprocess_shell(
                code,
                stdin=slave_fd,
                stdout=slave_fd,
                stderr=slave_fd,
                close_fds=False
            )

            # 关闭 slave_fd，父进程不再需要
            os.close(slave_fd)

            # 存储进程和 master fd 引用
            self._processes[script_id] = process
            self._master_fds[script_id] = master_fd

            # 设置脚本状态为运行中
            self._script_states[script_id] = 'running'

            loop = asyncio.get_event_loop()

            # 读取 PTY 输出的任务
            async def read_output():
                buffer = b""
                try:
                    while True:
                        data = await loop.run_in_executor(None, lambda: os.read(master_fd, 4096))
                        if not data:
                            # EOF: 发送剩余缓冲区的内容
                            if buffer:
                                await output_queue.put({
                                    "type": "stdout",
                                    "content": buffer.decode("utf-8", errors="replace"),
                                    "timestamp": _timestamp()
                                })
                            break

                        # 直接发送数据，支持 read -p 等无换行输出
                        content = (buffer + data).decode("utf-8", errors="replace")
                        buffer = b""

                        # 发送内容（保留 \r 用于光标回车）
                        await output_queue.put({
                            "type": "stdout",
                            "content": content,
                            "timestamp": _timestamp()
                        })
                        
                        # 同时添加到缓存
                        self._add_to_cache(script_id, {
                            "type": "stdout",
                            "content": content,
                            "timestamp": _timestamp()
                        })
                except OSError:
                    pass
                finally:
                    await output_queue.put(None)

            # 写入 PTY 输入的任务
            if stdin_queue:
                async def write_stdin():
                    try:
                        while True:
                            input_data = await stdin_queue.get()
                            if input_data is None:
                                break
                            try:
                                await loop.run_in_executor(None, lambda: os.write(master_fd, input_data.encode()))
                            except (BrokenPipeError, ConnectionResetError, OSError):
                                break
                    except asyncio.CancelledError:
                        pass

                stdin_task = asyncio.create_task(write_stdin())

            # 启动读取任务
            read_task = asyncio.create_task(read_output())

            # 从队列yield输出，同时处理超时
            timed_out = False
            try:
                async for output in self._wait_for_output_with_timeout(output_queue, timeout):
                    yield output
            except asyncio.TimeoutError:
                timed_out = True
                if process and process.returncode is None:
                    process.terminate()
                yield {
                    "type": "error",
                    "content": f"脚本执行超时 ({timeout}秒)，进程已终止",
                    "timestamp": _timestamp()
                }

        except Exception as e:
            yield {
                "type": "error",
                "content": f"执行错误: {str(e)}",
                "timestamp": _timestamp()
            }
        finally:
            # 如果超时，不发送退出消息
            if timed_out:
                await self._cleanup(script_id, process, read_task, stdin_task)
                return

            # 正常结束：等待进程退出并发送退出消息
            await self._cleanup(script_id, process, read_task, stdin_task)

            # 更新脚本状态为完成
            if script_id in self._script_states:
                if process and process.returncode is not None:
                    if process.returncode == 0:
                        self._script_states[script_id] = 'completed'
                    else:
                        self._script_states[script_id] = 'failed'
            
            # 发送退出消息
            if process:
                returncode = process.returncode if process.returncode is not None else 0
                yield {
                    "type": "exit",
                    "content": f"进程退出，返回码: {returncode}",
                    "timestamp": _timestamp()
                }

    def write_stdin(self, script_id: str, data: str):
        """向指定脚本的 stdin 写入数据"""
        if script_id in self._master_fds:
            master_fd = self._master_fds[script_id]
            try:
                os.write(master_fd, data.encode())
            except OSError:
                pass

    def kill_process(self, script_id: str):
        """终止指定脚本的进程"""
        if script_id in self._processes:
            process = self._processes[script_id]
            if process.returncode is None:
                process.terminate()
            del self._processes[script_id]
        if script_id in self._master_fds:
            try:
                os.close(self._master_fds[script_id])
            except OSError:
                pass
            del self._master_fds[script_id]
        if script_id in self._output_queues:
            del self._output_queues[script_id]

    def get_all_scripts(self) -> list:
        """返回所有脚本列表（包括正在运行、已完成和失败的脚本）"""
        scripts = []
        for script_id, state in self._script_states.items():
            scripts.append({
                'script_id': script_id,
                'status': state,
                'cached_lines': len(self._output_caches.get(script_id, []))
            })
        return scripts

    def get_script_status(self, script_id: str):
        """获取脚本状态和缓存的输出"""
        if script_id not in self._script_states:
            return None
        
        return {
            'script_id': script_id,
            'status': self._script_states[script_id],
            'cached_output': self._output_caches.get(script_id, []),
            'exit_code': self._processes.get(script_id, {}).returncode if script_id in self._processes else None
        }

    def _add_to_cache(self, script_id: str, output: dict):
        """添加输出到缓存，限制最多 1000 行"""
        if script_id not in self._output_caches:
            self._output_caches[script_id] = []

        cache = self._output_caches[script_id]
        cache.append(output)

        # 限制缓存大小
        if len(cache) > 1000:
            self._output_caches[script_id] = cache[-1000:]

    def clear_all(self):
        """清空所有脚本执行状态（用于测试）"""
        self._processes.clear()
        self._master_fds.clear()
        self._output_queues.clear()
        self._script_states.clear()
        self._output_caches.clear()


# 创建全局脚本执行器实例
executor = ScriptExecutor()
