"""OpenSandbox provider implementation."""

import logging
import time
from datetime import timedelta
from typing import Optional

from opensandbox import Sandbox as OSSandbox
from opensandbox.config import ConnectionConfig
from opensandbox.manager import SandboxManager as OSSandboxManager
from opensandbox.models.sandboxes import SandboxImageSpec, SandboxFilter

from backend.sandbox.base import SandboxProvider, Sandbox, CommandResult, SandboxInfo, ExecutionHandlers


logger = logging.getLogger(__name__)


# Renew when 50% of timeout has passed
RENEW_THRESHOLD = 0.5


class OpenSandboxSandbox(Sandbox):
    """Handle to an OpenSandbox instance with auto-renew capability."""

    def __init__(
        self,
        sandbox: OSSandbox,
        connection_config: ConnectionConfig,
        timeout: timedelta,
    ):
        self._sandbox = sandbox
        self._connection_config = connection_config
        self._timeout = timeout
        self._last_renew = time.time()

    @property
    def id(self) -> str:
        return self._sandbox.id

    @property
    def status(self) -> str:
        return "running"

    @property
    def sandbox(self) -> Sandbox:
        return self._sandbox

    async def _maybe_renew(self) -> None:
        """Renew sandbox if more than 50% of timeout has passed since last renew."""
        if self._timeout.total_seconds() == 0:
            return  # No expiration for 0 timeout (actually 24 hours)

        elapsed = time.time() - self._last_renew
        if elapsed > self._timeout.total_seconds() * RENEW_THRESHOLD:
            try:
                await self._sandbox.renew(self._timeout)
                self._last_renew = time.time()
                logger.info(f"Renewed sandbox {self._sandbox.id} (elapsed: {elapsed:.1f}s)")
            except Exception as e:
                logger.error(f"Failed to renew sandbox {self._sandbox.id}: {e}")

    async def execute_command(self, command: str) -> CommandResult:
        await self._maybe_renew()
        result = await self._sandbox.commands.run(command)
        stdout = "\n".join([line.text for line in result.logs.stdout]) if result.logs.stdout else ""
        stderr = "\n".join([line.text for line in result.logs.stderr]) if result.logs.stderr else ""
        exit_code = 1 if result.error else 0
        return CommandResult(output=stdout, error=stderr, exit_code=exit_code)

    async def execute_command_streaming(self, command: str, handlers: ExecutionHandlers) -> None:
        await self._maybe_renew()
        await self._sandbox.commands.run(command, handlers=handlers)

    async def get_info(self) -> SandboxInfo:
        info = await self._sandbox.get_info()
        return SandboxInfo(id=info.id, status=info.status.state)


class OpenSandboxProvider(SandboxProvider):
    """Provider using OpenSandbox Server."""

    def __init__(self, domain: str = "localhost:8081"):
        self._connection_config = ConnectionConfig(domain=domain)
        self._manager: Optional[OSSandboxManager] = None
        self._sandboxes: dict[str, OSSandbox] = {}
        self._sandbox_timeouts: dict[str, timedelta] = {}

    async def _get_manager(self) -> OSSandboxManager:
        if self._manager is None:
            self._manager = await OSSandboxManager.create(self._connection_config)
        return self._manager

    def _get_default_image(self) -> SandboxImageSpec:
        return SandboxImageSpec(
            image="sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"
        )

    async def create_sandbox(
        self,
        sandbox_id: str | None = None,
        image: str | None = None,
        init_commands: list[str] | None = None,
        env: dict[str, str] | None = None,
        expire_time: int | None = None,
        type: str | None = None
    ) -> OpenSandboxSandbox:
        # Determine timeout: expire_time=None -> default 10min, 0 -> 24 hours, >0 -> custom seconds
        if expire_time is None:
            timeout = timedelta(minutes=10)
        elif expire_time <= 0:
            timeout = timedelta(hours=24)
        else:
            timeout = timedelta(seconds=expire_time)

        image_uri = image or "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"

        sandbox = await OSSandbox.create(
            image=SandboxImageSpec(image=image_uri),
            resource={"cpu": "2", "memory": "2048Mi"},
            timeout=timeout,
            connection_config=self._connection_config,
            skip_health_check=False,
            env=env
        )

        sandbox_id = sandbox.id
        self._sandboxes[sandbox_id] = sandbox
        self._sandbox_timeouts[sandbox_id] = timeout

        info = await sandbox.get_info()
        logger.info(f"Created OpenSandbox: {sandbox_id}, status: {info.status.state}, timeout: {timeout.total_seconds()}s")

        if init_commands:
            for cmd in init_commands:
                logger.info(f"Executing init command in sandbox {sandbox_id}: {cmd}")
                try:
                    await sandbox.commands.run(cmd)
                except Exception as e:
                    logger.error(f"Error executing init command: {e}")

        return OpenSandboxSandbox(sandbox, self._connection_config, timeout)

    async def list_sandboxes(self) -> list[SandboxInfo]:
        manager = await self._get_manager()
        result = await manager.list_sandbox_infos(SandboxFilter())
        return [SandboxInfo(id=sb.id, status="running") for sb in result.sandbox_infos]

    async def get_sandbox(self, sandbox_id: str) -> OpenSandboxSandbox:
        sandbox = self._sandboxes.get(sandbox_id)
        if sandbox is None:
            logger.info(f"Reconnecting to sandbox: {sandbox_id}")
            sandbox = await OSSandbox.connect(sandbox_id, self._connection_config)
            self._sandboxes[sandbox_id] = sandbox

        timeout = self._sandbox_timeouts.get(sandbox_id, timedelta(minutes=10))
        return OpenSandboxSandbox(sandbox, self._connection_config, timeout)

    async def kill_sandbox(self, sandbox_id: str) -> None:
        manager = await self._get_manager()
        logger.info(f"Killing sandbox: {sandbox_id}")
        try:
            await manager.kill_sandbox(sandbox_id)
        finally:
            self._sandboxes.pop(sandbox_id, None)
            self._sandbox_timeouts.pop(sandbox_id, None)
