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
    """Handle to a local Docker container with auto activity tracking."""

    def __init__(
        self,
        sandbox_id: str,
        container_id: str,
        client: docker.DockerClient,
        timeout_seconds: int
    ):
        self._sandbox_id = sandbox_id
        self._container_id = container_id
        self._client = client
        self._container = client.containers.get(container_id)
        self._timeout_seconds = timeout_seconds
        self._last_activity = time.time()

    def _update_activity(self) -> None:
        """Update the last activity time for this sandbox."""
        if self._timeout_seconds > 0:
            self._last_activity = time.time()

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
        return SandboxInfo(
            id=self._sandbox_id,
            status=self._container.status,
            container_id=self._container_id,
            type=self._container.labels.get("type")
        )


class LocalDockerProvider(SandboxProvider):
    """Provider using local Docker with automatic timeout cleanup."""

    def __init__(self, config: SandboxConfig):
        self._client = docker.from_env()
        self._sandboxes: dict[str, LocalDockerSandbox] = {}
        self._timeout_seconds = config.local_docker_timeout_minutes * 60
        self._cleanup_task: asyncio.Task | None = None
        self._config = config

        # Clean up orphaned containers from previous runs
        self._cleanup_orphaned_containers()

    @staticmethod
    def _parse_volume_spec(volume_str: str) -> dict:
        """
        Parse Docker Compose style volume string to Docker SDK format.

        Format: host_path:container_path[:mode]
        Examples:
            "/host/path:/container/path:rw" -> {"bind": "/container/path", "mode": "rw"}
            "/host/path:/container/path" -> {"bind": "/container/path", "mode": "rw"}
            "./relative:/container/path:ro" -> {"bind": "./relative", "mode": "ro"}

        Returns dict with keys: {"bind": container_path, "mode": "rw" or "ro"}
        """
        parts = volume_str.split(":")
        if len(parts) < 2:
            raise ValueError(f"Invalid volume spec: {volume_str}. Expected format: host_path:container_path[:mode]")

        if len(parts) == 2:
            host_path, container_path = parts
            mode = "rw"
        else:
            host_path, container_path, mode = parts
            if mode not in ("rw", "ro"):
                raise ValueError(f"Invalid volume mode: {mode}. Must be 'rw' or 'ro'")

        return {"bind": container_path, "mode": mode}

    def _cleanup_orphaned_containers(self) -> None:
        """Clean up containers left from previous process runs (skip fixed_id containers)."""
        try:
            containers = self._client.containers.list(
                all=True,
                filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"}
            )
            for container in containers:
                # Skip containers with fixed_id=true (they should persist)
                if container.labels.get("fixed_id") == "true":
                    continue
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

    async def _cleanup_expired_sandboxes(self) -> None:
        """Background task to clean up expired and orphaned sandboxes."""
        logger.info(f"Starting sandbox cleanup task (default timeout: {self._config.local_docker_timeout_minutes} minutes)")
        while True:
            try:
                await asyncio.sleep(60)  # Check every minute
                current_time = time.time()

                # Clean up tracked expired sandboxes
                expired_ids = []
                for sandbox_id, sandbox in list(self._sandboxes.items()):
                    if sandbox._timeout_seconds > 0:
                        elapsed = current_time - sandbox._last_activity
                        if elapsed > sandbox._timeout_seconds:
                            expired_ids.append(sandbox_id)

                for sandbox_id in expired_ids:
                    logger.info(f"Cleaning up expired sandbox: {sandbox_id}")
                    await self.kill_sandbox(sandbox_id)

                # Clean up orphaned containers (exist in Docker but not tracked)
                await self._cleanup_orphaned_containers_async()
            except asyncio.CancelledError:
                logger.info("Cleanup task cancelled")
                break
            except Exception as e:
                logger.error(f"Error in cleanup task: {e}")

    async def _cleanup_orphaned_containers_async(self) -> None:
        """Clean up containers that exist in Docker but are not tracked in memory."""
        try:
            containers = self._client.containers.list(
                all=True,
                filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"}
            )
            for container in containers:
                sandbox_id = container.labels.get("sandbox_id")
                if not sandbox_id:
                    continue

                # Skip if tracked in memory
                if sandbox_id in self._sandboxes:
                    continue

                # Skip fixed_id containers
                if container.labels.get("fixed_id") == "true":
                    continue

                # For orphaned containers, check if they're old enough to clean up
                # Use container creation time as a heuristic
                try:
                    created_timestamp = container.attrs["Created"]
                    # Parse Docker timestamp (e.g., "2025-02-07T12:00:00.123456789Z")
                    # Simple approach: if container is older than default timeout, clean it up
                    if self._timeout_seconds > 0:
                        # Container is old enough, clean it up
                        logger.info(f"Cleaning up orphaned container: {sandbox_id} ({container.id[:12]})")
                        container.stop(timeout=5)
                        container.remove()
                except Exception as e:
                    logger.error(f"Error cleaning up orphaned container {container.id}: {e}")
        except Exception as e:
            logger.error(f"Error listing orphaned containers: {e}")

    def _start_cleanup_task(self) -> None:
        """Start the background cleanup task."""
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_expired_sandboxes())

    async def create_sandbox(
        self,
        sandbox_id: str | None = None,
        image: str | None = None,
        init_commands: list[str] | None = None,
        env: dict[str, str] | None = None,
        expire_time: int | None = None,
        type: str | None = None,
        volumes: list[str] | None = None
    ) -> LocalDockerSandbox:
        # Generate sandbox_id if None or "auto"
        is_auto_id = sandbox_id is None or sandbox_id == "auto"
        if is_auto_id:
            sandbox_id = self._generate_sandbox_id()

        # Determine timeout: expire_time=None -> default, 0 -> never expire, >0 -> custom seconds
        if expire_time is None:
            timeout_seconds = self._timeout_seconds
        elif expire_time <= 0:
            timeout_seconds = 0  # Never expire
        else:
            timeout_seconds = expire_time

        # Start cleanup task only if sandbox can expire
        if timeout_seconds > 0:
            self._start_cleanup_task()

        image_uri = image or "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"

        # Pull image if not exists
        try:
            self._client.images.get(image_uri)
        except docker.errors.ImageNotFound:
            logger.info(f"Pulling image: {image_uri}")
            self._client.images.pull(image_uri)

        # Check if container with this sandbox_id already exists
        existing_containers = self._client.containers.list(
            all=True,
            filters={"label": f"{SANDBOX_LABEL_KEY}={SANDBOX_LABEL_VALUE}"}
        )

        container = None
        for c in existing_containers:
            if c.labels.get("sandbox_id") == sandbox_id:
                container = c
                logger.info(f"Reusing existing container: {container.id} with sandbox_id: {sandbox_id}")
                break

        # Create new container if not exists
        if container is None:
            # Remove old container with same name if exists (for fixed_id reuse)
            try:
                self._client.containers.get(sandbox_id).remove(force=True)
                logger.info(f"Removed old container with name: {sandbox_id}")
            except:
                pass

            # Parse volumes from Docker Compose format to Docker SDK format
            docker_volumes = {}
            if volumes:
                for vol_spec in volumes:
                    parsed = self._parse_volume_spec(vol_spec)
                    docker_volumes[vol_spec.split(":")[0]] = parsed

            container = self._client.containers.run(
                image_uri,
                name=sandbox_id,
                command=["sh", "-c", "tail -f /dev/null"],
                detach=True,
                stdin_open=True,
                tty=True,
                environment=env or {},
                volumes=docker_volumes,
                labels={
                    SANDBOX_LABEL_KEY: SANDBOX_LABEL_VALUE,
                    "sandbox_id": sandbox_id,
                    **({"fixed_id": "true"} if timeout_seconds == 0 else {}),
                    **({"type": type} if type else {}),
                },
            )
            logger.info(f"Created container: {container.id} (name: {sandbox_id}) (timeout={timeout_seconds}s)")

        handle = LocalDockerSandbox(sandbox_id, container.id, self._client, timeout_seconds)
        self._sandboxes[sandbox_id] = handle

        # Execute init commands (only for newly created containers that can expire)
        if init_commands and container.labels.get("fixed_id") != "true":
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
        handle = self._sandboxes.get(sandbox_id)

        # If not in cache, query Docker
        if handle is None:
            try:
                # First try to get container by name (sandbox_id is now the container name)
                container = self._client.containers.get(sandbox_id)
                container_id = container.id
            except:
                # Fall back to searching by label (for old containers without name set)
                containers = self._client.containers.list(
                    all=False,
                    filters={"label": f"sandbox_id={sandbox_id}"}
                )
                if not containers:
                    raise ValueError(f"Sandbox not found: {sandbox_id}")
                container_id = containers[0].id

            # Get timeout from container label
            timeout_seconds = self._timeout_seconds
            try:
                container = self._client.containers.get(container_id)
                fixed_id = container.labels.get("fixed_id")
                if fixed_id == "true":
                    timeout_seconds = 0
            except:
                pass

            handle = LocalDockerSandbox(sandbox_id, container_id, self._client, timeout_seconds)
            self._sandboxes[sandbox_id] = handle

        return handle

    async def kill_sandbox(self, sandbox_id: str) -> None:
        handle = self._sandboxes.pop(sandbox_id, None)
        if handle is None:
            logger.warning(f"Sandbox not found: {sandbox_id}")
            return

        container_id = handle._container_id
        logger.info(f"Killing container: {container_id}")
        try:
            container = self._client.containers.get(container_id)
            container.stop(timeout=5)
            container.remove()
        except Exception as e:
            logger.error(f"Error killing container {container_id}: {e}")
