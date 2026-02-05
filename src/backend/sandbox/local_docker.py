"""Local Docker provider implementation with timeout cleanup."""

import asyncio
import logging
import time
import uuid
from typing import Optional

import docker

from backend.config import SandboxConfig
from backend.sandbox.base import (
    SandboxProvider, Sandbox, CommandResult, SandboxInfo, ExecutionHandlers,
    StdoutMessage, StderrMessage, ExecutionCompleteMessage, InitMessage, ErrorMessage
)


logger = logging.getLogger(__name__)

# Container label to identify ScriptBook sandboxes
SANDBOX_LABEL_KEY = "scriptbook_sandbox"
SANDBOX_LABEL_VALUE = "true"


class LocalDockerSandbox(Sandbox):
    """Handle to a local Docker container."""

    def __init__(
        self,
        sandbox_id: str,
        container_id: str,
        client: docker.DockerClient,
        update_activity_callback: callable
    ):
        self._sandbox_id = sandbox_id
        self._container_id = container_id
        self._client = client
        self._container = client.containers.get(container_id)
        self._update_activity = update_activity_callback

    @property
    def id(self) -> str:
        return self._sandbox_id

    @property
    def status(self) -> str:
        self._update_activity()
        try:
            self._container.reload()
            return self._container.status
        except Exception:
            return "unknown"

    def _ensure_container_running(self) -> None:
        """Ensure container exists and is running, raise error otherwise."""
        try:
            self._container.reload()
            if self._container.status != "running":
                raise ValueError(f"Container is not running (status: {self._container.status})")
        except docker.errors.NotFound:
            raise ValueError(f"Container not found: {self._container_id}")
        except Exception as e:
            raise ValueError(f"Container error: {e}")

    async def execute_command(self, command: str) -> CommandResult:
        self._ensure_container_running()
        self._update_activity()
        exec_instance = self._client.api.exec_create(
            self._container_id,
            ["sh", "-c", command],
            stdout=True,
            stderr=True,
            stdin=False
        )
        # Use demux=True to get separate stdout and stderr
        stdout_output, stderr_output = self._client.api.exec_start(exec_instance, demux=True)

        exec_info = self._client.api.exec_inspect(exec_instance)
        exit_code = exec_info.get("ExitCode", 0)

        return CommandResult(
            output=stdout_output.decode('utf-8') if stdout_output else "",
            error=stderr_output.decode('utf-8') if stderr_output else "",
            exit_code=exit_code
        )

    async def execute_command_streaming(self, command: str, handlers: ExecutionHandlers) -> None:
        self._ensure_container_running()
        self._update_activity()

        exec_instance = self._client.api.exec_create(
            self._container_id,
            ["sh", "-c", command],
            stdout=True,
            stderr=True,
            stdin=False
        )

        # Notify init (command execution started)
        if handlers and handlers.on_init:
            await handlers.on_init(InitMessage(exec_instance))

        # Use stream=True with demux=True to get separate stdout/stderr chunks
        output_stream = self._client.api.exec_start(exec_instance, stream=True, demux=True)

        try:
            for stdout_chunk, stderr_chunk in output_stream:
                if stdout_chunk and handlers and handlers.on_stdout:
                    text = stdout_chunk.decode('utf-8', errors='ignore')
                    lines = text.split('\n')
                    for i, line in enumerate(lines):
                        if i < len(lines) - 1 or line:
                            await handlers.on_stdout(StdoutMessage(line + '\n' if i < len(lines) - 1 else line))
                if stderr_chunk and handlers and handlers.on_stderr:
                    text = stderr_chunk.decode('utf-8', errors='ignore')
                    lines = text.split('\n')
                    for i, line in enumerate(lines):
                        if i < len(lines) - 1 or line:
                            await handlers.on_stderr(StderrMessage(line + '\n' if i < len(lines) - 1 else line))
        except Exception as e:
            if handlers and handlers.on_error:
                await handlers.on_error(ErrorMessage("ExecutionError", str(e)))
            raise

        # Get exit code
        exec_info = self._client.api.exec_inspect(exec_instance)
        exit_code = exec_info.get("ExitCode", 0)

        if handlers and handlers.on_execution_complete:
            await handlers.on_execution_complete(ExecutionCompleteMessage(exit_code))

    async def get_info(self) -> SandboxInfo:
        self._update_activity()
        self._container.reload()
        return SandboxInfo(id=self._sandbox_id, status=self._container.status)


class LocalDockerProvider(SandboxProvider):
    """Provider using local Docker with automatic timeout cleanup."""

    def __init__(self, config: SandboxConfig):
        self._client = docker.from_env()
        self._sandboxes: dict[str, str] = {}  # sandbox_id -> container_id
        self._last_activity: dict[str, float] = {}  # sandbox_id -> timestamp
        self._timeout_seconds = config.local_docker_timeout_minutes * 60
        self._cleanup_task: asyncio.Task | None = None
        self._config = config

        # Clean up orphaned containers from previous runs
        self._cleanup_orphaned_containers()

    def _cleanup_orphaned_containers(self) -> None:
        """Clean up containers left from previous process runs."""
        try:
            containers = self._client.containers.list(
                all=True,
                filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"}
            )
            for container in containers:
                try:
                    logger.info(f"Cleaning up orphaned container: {container.id[:12]}")
                    container.stop(timeout=5)
                    container.remove()
                except Exception as e:
                    logger.error(f"Error cleaning up container {container.id}: {e}")
        except Exception as e:
            logger.error(f"Error listing orphaned containers: {e}")

    def _generate_sandbox_id(self) -> str:
        return str(uuid.uuid4())

    def _update_activity(self, sandbox_id: str) -> None:
        """Update the last activity time for a sandbox."""
        self._last_activity[sandbox_id] = time.time()

    async def _cleanup_expired_sandboxes(self) -> None:
        """Background task to clean up expired sandboxes."""
        logger.info(f"Starting sandbox cleanup task (timeout: {self._config.local_docker_timeout_minutes} minutes)")
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                current_time = time.time()
                expired_ids = [
                    sid for sid, last_active in self._last_activity.items()
                    if current_time - last_active > self._timeout_seconds
                ]

                for sandbox_id in expired_ids:
                    logger.info(f"Cleaning up expired sandbox: {sandbox_id}")
                    await self.kill_sandbox(sandbox_id)
            except asyncio.CancelledError:
                logger.info("Cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")

    def _start_cleanup_task(self) -> None:
        """Start the background cleanup task."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_expired_sandboxes())

    async def create_sandbox(
        self,
        image: Optional[str] = None,
        init_commands: Optional[list[str]] = None,
        env: Optional[dict[str, str]] = None
    ) -> LocalDockerSandbox:
        # Start cleanup task on first sandbox creation
        self._start_cleanup_task()

        image_uri = image or "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"

        # Pull image if not exists
        try:
            self._client.images.get(image_uri)
        except docker.errors.ImageNotFound:
            logger.info(f"Pulling image: {image_uri}")
            self._client.images.pull(image_uri)

        # Generate sandbox_id first
        sandbox_id = self._generate_sandbox_id()

        # Create and start container
        container = self._client.containers.run(
            image_uri,
            command=["sh", "-c", "tail -f /dev/null"],
            detach=True,
            stdin_open=True,
            tty=True,
            environment=env or {},
            labels={
                SANDBOX_LABEL_KEY: SANDBOX_LABEL_VALUE,
                "sandbox_id": sandbox_id,
            },
        )

        self._sandboxes[sandbox_id] = container.id
        self._update_activity(sandbox_id)

        logger.info(f"Created container: {container.id} with sandbox_id: {sandbox_id}")

        def update_callback():
            self._update_activity(sandbox_id)

        handle = LocalDockerSandbox(sandbox_id, container.id, self._client, update_callback)

        # Execute init commands
        if init_commands:
            for cmd in init_commands:
                logger.info(f"Executing init command in sandbox {sandbox_id}: {cmd}")
                try:
                    await handle.execute_command(cmd)
                except Exception as e:
                    logger.error(f"Error executing init command: {e}")

        return handle

    async def list_sandboxes(self) -> list[SandboxInfo]:
        """List all sandboxes by querying Docker directly."""
        result = []
        try:
            containers = self._client.containers.list(
                all=False,  # Only running containers
                filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"}
            )
            for container in containers:
                sandbox_id = container.labels.get("sandbox_id", container.id[:12])
                result.append(SandboxInfo(id=sandbox_id, status=container.status))
        except Exception as e:
            logger.error(f"Error listing sandboxes: {e}")
        return result

    async def get_sandbox(self, sandbox_id: str) -> LocalDockerSandbox:
        """Get sandbox by querying Docker directly."""
        # First try memory cache
        container_id = self._sandboxes.get(sandbox_id)

        # If not in cache, query Docker by label
        if container_id is None:
            try:
                containers = self._client.containers.list(
                    all=False,  # Only running containers
                    filters={"label": f"sandbox_id={sandbox_id}"}
                )
                if not containers:
                    raise ValueError(f"Sandbox not found: {sandbox_id}")
                container_id = containers[0].id
                self._sandboxes[sandbox_id] = container_id
            except Exception as e:
                raise ValueError(f"Sandbox not found: {sandbox_id}: {e}")

        # Verify container is actually running
        try:
            container = self._client.containers.get(container_id)
            container.reload()
            if container.status != "running":
                # Remove from cache and raise error
                self._sandboxes.pop(sandbox_id, None)
                self._last_activity.pop(sandbox_id, None)
                raise ValueError(f"Sandbox is not running (status: {container.status}): {sandbox_id}")
        except docker.errors.NotFound:
            # Container doesn't exist, remove from cache
            self._sandboxes.pop(sandbox_id, None)
            self._last_activity.pop(sandbox_id, None)
            raise ValueError(f"Sandbox container not found: {sandbox_id}")
        except Exception as e:
            raise ValueError(f"Error accessing sandbox: {e}")

        def update_callback():
            self._update_activity(sandbox_id)

        return LocalDockerSandbox(sandbox_id, container_id, self._client, update_callback)

    async def kill_sandbox(self, sandbox_id: str) -> None:
        container_id = self._sandboxes.pop(sandbox_id, None)
        self._last_activity.pop(sandbox_id, None)
        if container_id is None:
            logger.warning(f"Sandbox not found: {sandbox_id}")
            return

        logger.info(f"Killing container: {container_id}")
        try:
            container = self._client.containers.get(container_id)
            container.stop(timeout=5)
            container.remove()
        except Exception as e:
            logger.error(f"Error killing container {container_id}: {e}")
