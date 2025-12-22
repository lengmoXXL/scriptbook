from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from scriptbook.models.schemas import ScriptOutputMessage, ScriptInputMessage
import asyncio
import subprocess
import sys
from datetime import datetime
import json

# 创建不带prefix的router
router = APIRouter(tags=["scripts"])

@router.websocket("/scripts/{script_id}/execute")
async def execute_script(websocket: WebSocket, script_id: str):
    """
    WebSocket端点，用于执行脚本并实时输出，支持交互式输入
    """
    await websocket.accept()

    process = None
    stdin_queue = asyncio.Queue()
    connection_closed = False

    async def safe_send(message):
        """安全发送消息，如果连接已关闭则跳过"""
        nonlocal connection_closed
        if not connection_closed:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"发送消息失败: {e}")
                connection_closed = True

    try:
        # 接收脚本代码
        data = await websocket.receive_json()
        code = data.get("code", "")

        if not code:
            await safe_send({
                "type": "error",
                "content": "脚本代码为空"
            })
            return

        # 执行bash脚本，启用stdin管道
        process = await asyncio.create_subprocess_shell(
            code,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            stdin=subprocess.PIPE,
            shell=True
        )

        # 从WebSocket接收输入消息的任务
        async def receive_input():
            try:
                while True:
                    data = await websocket.receive_text()
                    try:
                        msg = json.loads(data)
                        if msg.get("type") == "input":
                            content = msg.get("content", "")
                            # 将输入内容放入队列，添加换行符（因为大多数命令需要回车）
                            await stdin_queue.put(content + "\n")
                    except json.JSONDecodeError:
                        # 如果不是JSON，可能直接是文本输入
                        await stdin_queue.put(data + "\n")
            except WebSocketDisconnect:
                # 客户端断开连接
                print(f"客户端断开连接: {script_id}")
                await stdin_queue.put(None)  # 发送结束信号
                connection_closed = True
            except Exception as e:
                print(f"接收输入错误: {e}")
                await stdin_queue.put(None)

        # 向进程stdin写入数据的任务
        async def write_stdin():
            try:
                while True:
                    # 从队列获取输入
                    input_data = await stdin_queue.get()
                    if input_data is None:  # 结束信号
                        if process.stdin:
                            process.stdin.close()
                        break

                    if process.stdin and not process.stdin.is_closing():
                        try:
                            process.stdin.write(input_data.encode())
                            await process.stdin.drain()
                        except (BrokenPipeError, ConnectionResetError):
                            # 进程可能已经结束
                            break
            except Exception as e:
                print(f"写入stdin错误: {e}")
            finally:
                if process.stdin and not process.stdin.is_closing():
                    process.stdin.close()

        # 读取输出流（stdout/stderr）的任务
        async def read_stream(stream, output_type):
            try:
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    message = ScriptOutputMessage(
                        type=output_type,
                        content=line.decode("utf-8", errors="replace").rstrip(),
                        timestamp=datetime.now().isoformat()
                    )
                    await safe_send(message.dict())
            except Exception as e:
                print(f"读取{output_type}错误: {e}")

        # 启动所有任务
        receive_task = asyncio.create_task(receive_input())
        stdin_task = asyncio.create_task(write_stdin())
        stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
        stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))

        # 等待输出任务完成
        await asyncio.gather(stdout_task, stderr_task)

        # 进程结束时，停止接收输入
        receive_task.cancel()
        stdin_task.cancel()

        try:
            await receive_task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

        try:
            await stdin_task
        except asyncio.CancelledError:
            pass
        except Exception:
            pass

        # 等待进程结束
        returncode = await process.wait()

        # 发送退出状态
        if not connection_closed:
            exit_message = ScriptOutputMessage(
                type="exit",
                content=f"进程退出，返回码: {returncode}",
                timestamp=datetime.now().isoformat()
            )
            await safe_send(exit_message.dict())

    except WebSocketDisconnect:
        print(f"客户端断开连接: {script_id}")
        connection_closed = True
        if process and process.returncode is None:
            process.terminate()
    except Exception as e:
        print(f"执行脚本错误: {e}")
        if not connection_closed:
            error_message = ScriptOutputMessage(
                type="error",
                content=f"执行错误: {str(e)}",
                timestamp=datetime.now().isoformat()
            )
            await safe_send(error_message.dict())
    finally:
        # 清理
        if process and process.returncode is None:
            try:
                process.terminate()
            except:
                pass
        # 只有在连接未关闭时才尝试关闭
        if not connection_closed:
            try:
                await websocket.close()
            except Exception as e:
                print(f"关闭WebSocket失败: {e}")
                connection_closed = True