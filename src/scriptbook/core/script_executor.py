import asyncio
import subprocess
from typing import AsyncGenerator, Dict, Any
from datetime import datetime

class ScriptExecutor:
    """脚本执行器，用于执行bash脚本"""

    def __init__(self):
        self._processes: Dict[str, asyncio.subprocess.Process] = {}

    async def execute(
        self,
        script_id: str,
        code: str,
        timeout: int = 30
    ) -> AsyncGenerator[Dict[str, Any], None]:
        """
        异步执行bash脚本

        Args:
            script_id: 脚本ID
            code: 脚本代码
            timeout: 超时时间（秒）

        Yields:
            输出消息字典，包含type, content, timestamp
        """
        process = None
        terminated = False
        try:
            # 创建子进程
            process = await asyncio.create_subprocess_shell(
                code,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                shell=True
            )

            # 存储进程引用
            self._processes[script_id] = process

            # 读取输出的协程
            async def read_output(stream, output_type):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    yield {
                        "type": output_type,
                        "content": line.decode("utf-8", errors="replace").rstrip(),
                        "timestamp": datetime.now().isoformat()
                    }

            # 同时读取stdout和stderr
            stdout_reader = read_output(process.stdout, "stdout")
            stderr_reader = read_output(process.stderr, "stderr")

            # 合并输出流
            async for output in self._merge_outputs(stdout_reader, stderr_reader):
                yield output

            # 使用wait_for设置超时
            try:
                returncode = await asyncio.wait_for(process.wait(), timeout=timeout)
                yield {
                    "type": "exit",
                    "content": f"进程退出，返回码: {returncode}",
                    "timestamp": datetime.now().isoformat()
                }
            except asyncio.TimeoutError:
                # 超时，终止进程
                terminated = True
                process.terminate()
                yield {
                    "type": "error",
                    "content": f"脚本执行超时 ({timeout}秒)，进程已终止",
                    "timestamp": datetime.now().isoformat()
                }

        except Exception as e:
            yield {
                "type": "error",
                "content": f"执行错误: {str(e)}",
                "timestamp": datetime.now().isoformat()
            }
        finally:
            # 清理进程引用
            if script_id in self._processes:
                del self._processes[script_id]
            # 只在未终止且进程仍在运行时才终止
            if process and not terminated and process.returncode is None:
                try:
                    process.terminate()
                except:
                    pass

    async def _merge_outputs(self, *generators):
        """合并多个异步生成器的输出"""
        # 简化实现：按顺序读取
        # 实际应该使用asyncio.Queue
        for gen in generators:
            async for item in gen:
                yield item

    def kill_process(self, script_id: str):
        """终止指定脚本的进程"""
        if script_id in self._processes:
            process = self._processes[script_id]
            if process.returncode is None:
                process.terminate()
            del self._processes[script_id]


# 创建全局脚本执行器实例
executor = ScriptExecutor()