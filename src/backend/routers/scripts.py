from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from backend.models.schemas import ScriptOutputMessage, ScriptInputMessage
from backend.core.script_executor import executor
import asyncio
import json


# 创建不带prefix的router
router = APIRouter(tags=["scripts"])


@router.get("/scripts")
async def get_all_scripts():
    """返回所有正在运行的脚本列表"""
    return executor.get_all_scripts()


@router.get("/scripts/{script_id}/status")
async def get_script_status(script_id: str):
    """获取脚本状态和缓存的输出"""
    status = executor.get_script_status(script_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Script not found")
    return status

@router.websocket("/scripts/{script_id}/execute")
async def execute_script(websocket: WebSocket, script_id: str):
    """
    WebSocket端点，用于执行脚本并实时输出，支持交互式输入
    使用 ScriptExecutor 执行脚本，支持 PTY（伪终端）
    """
    await websocket.accept()

    connection_closed = False
    stdin_queue = asyncio.Queue()

    async def safe_send(message):
        """安全发送消息，如果连接已关闭则跳过"""
        nonlocal connection_closed
        if not connection_closed:
            try:
                await websocket.send_json(message)
            except Exception as e:
                print(f"发送消息失败: {e}")
                connection_closed = True

    async def receive_input():
        """从WebSocket接收输入消息"""
        try:
            while True:
                data = await websocket.receive_text()
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "input":
                        content = msg.get("content", "")
                        # 只有收到换行符时才添加换行，其他字符直接发送
                        if content == '\r' or content == '\n':
                            await stdin_queue.put(content)
                        else:
                            await stdin_queue.put(content)
                except json.JSONDecodeError:
                    # 非 JSON 数据直接添加换行（向后兼容）
                    await stdin_queue.put(data + "\n")
        except WebSocketDisconnect:
            print(f"客户端断开连接: {script_id}")
            await stdin_queue.put(None)
        except Exception as e:
            print(f"接收输入错误: {e}")
            await stdin_queue.put(None)

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

        # 启动输入接收任务
        receive_task = asyncio.create_task(receive_input())

        # 使用 ScriptExecutor 执行脚本，传入 stdin_queue
        async for output in executor.execute(script_id, code, timeout=1800, stdin_queue=stdin_queue):
            await safe_send(output)

        # 取消输入接收任务
        receive_task.cancel()
        try:
            await receive_task
        except asyncio.CancelledError:
            pass

    except WebSocketDisconnect:
        print(f"客户端断开连接: {script_id}")
        connection_closed = True
        # 不再自动杀死进程，允许脚本继续运行
        # 客户端可以重新连接来查看输出
    except Exception as e:
        print(f"执行脚本错误: {e}")
        if not connection_closed:
            await safe_send({
                "type": "error",
                "content": f"执行错误: {str(e)}"
            })
    finally:
        # 注意：不在这里杀死进程，允许脚本继续运行
        # 进程会在脚本执行完成时自动清理
        if not connection_closed:
            try:
                await websocket.close()
            except Exception as e:
                print(f"关闭WebSocket失败: {e}")
                connection_closed = True