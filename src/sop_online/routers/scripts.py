from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sop_online.models.schemas import ScriptOutputMessage
import asyncio
import subprocess
import sys
from datetime import datetime

# 创建不带prefix的router
router = APIRouter(tags=["scripts"])

@router.websocket("/scripts/{script_id}/execute")
async def execute_script(websocket: WebSocket, script_id: str):
    """
    WebSocket端点，用于执行脚本并实时输出
    """
    await websocket.accept()

    try:
        # 接收脚本代码
        data = await websocket.receive_json()
        code = data.get("code", "")

        if not code:
            await websocket.send_json({
                "type": "error",
                "content": "脚本代码为空"
            })
            return

        # 执行bash脚本
        process = await asyncio.create_subprocess_shell(
            code,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            shell=True
        )

        # 实时读取输出
        async def read_stream(stream, output_type):
            while True:
                line = await stream.readline()
                if not line:
                    break
                message = ScriptOutputMessage(
                    type=output_type,
                    content=line.decode("utf-8", errors="replace").rstrip(),
                    timestamp=datetime.now().isoformat()
                )
                await websocket.send_json(message.dict())

        # 同时读取stdout和stderr
        stdout_task = asyncio.create_task(read_stream(process.stdout, "stdout"))
        stderr_task = asyncio.create_task(read_stream(process.stderr, "stderr"))

        await stdout_task
        await stderr_task

        # 等待进程结束
        returncode = await process.wait()

        # 发送退出状态
        exit_message = ScriptOutputMessage(
            type="exit",
            content=f"进程退出，返回码: {returncode}",
            timestamp=datetime.now().isoformat()
        )
        await websocket.send_json(exit_message.dict())

    except WebSocketDisconnect:
        print(f"客户端断开连接: {script_id}")
    except Exception as e:
        error_message = ScriptOutputMessage(
            type="error",
            content=f"执行错误: {str(e)}",
            timestamp=datetime.now().isoformat()
        )
        await websocket.send_json(error_message.dict())
    finally:
        await websocket.close()