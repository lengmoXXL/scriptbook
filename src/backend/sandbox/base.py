"""Base interfaces for sandbox providers."""

from abc import abstractmethod
from dataclasses import dataclass
from typing import Protocol, Callable, Awaitable, Any

from pydantic import BaseModel, Field


@dataclass
class CommandResult:
    """Result of a command execution."""
    output: str
    error: str
    exit_code: int


@dataclass
class SandboxInfo:
    """Sandbox information."""
    id: str
    status: str
    container_id: str | None = None


class StdoutMessage:
    """Stdout message for streaming execution."""
    def __init__(self, text: str):
        self.text = text


class StderrMessage:
    """Stderr message for streaming execution."""
    def __init__(self, text: str):
        self.text = text


class ExecutionCompleteMessage:
    """Execution complete message."""
    def __init__(self, exit_code: int, execution_time_in_millis: int | None = None):
        self.exit_code = exit_code
        self.execution_time_in_millis = execution_time_in_millis


class InitMessage:
    """Execution init message."""
    def __init__(self, exec_id: str):
        self.id = exec_id


class ErrorMessage:
    """Execution error message."""
    def __init__(self, name: str, value: str):
        self.name = name
        self.value = value


class ExecutionHandlers(BaseModel):
    """Callbacks for streaming command execution."""
    on_stdout: Callable[[Any], Awaitable[None]] | None = Field(default=None)
    on_stderr: Callable[[Any], Awaitable[None]] | None = Field(default=None)
    on_result: Callable[[Any], Awaitable[None]] | None = Field(default=None)
    on_execution_complete: Callable[[Any], Awaitable[None]] | None = Field(default=None, alias="on_execution_complete")
    on_error: Callable[[Any], Awaitable[None]] | None = Field(default=None)
    on_init: Callable[[Any], Awaitable[None]] | None = Field(default=None)

    class Config:
        arbitrary_types_allowed = True
        populate_by_name = True


class Sandbox(Protocol):
    """Handle to a sandbox instance."""

    @property
    def id(self) -> str: ...

    @property
    def status(self) -> str: ...

    @abstractmethod
    async def execute_command(self, command: str) -> CommandResult: ...

    @abstractmethod
    async def execute_command_streaming(self, command: str, handlers: ExecutionHandlers) -> None: ...

    @abstractmethod
    async def get_info(self) -> SandboxInfo: ...


class SandboxProvider(Protocol):
    """Provider for creating and managing sandboxes."""

    @abstractmethod
    async def create_sandbox(
        self,
        sandbox_id: str | None = None,
        image: str | None = None,
        init_commands: list[str] | None = None,
        env: dict[str, str] | None = None,
        expire_time: int | None = None,
        type: str | None = None
    ) -> Sandbox: ...

    @abstractmethod
    async def list_sandboxes(self) -> list[SandboxInfo]: ...

    @abstractmethod
    async def get_sandbox(self, sandbox_id: str) -> Sandbox: ...

    @abstractmethod
    async def kill_sandbox(self, sandbox_id: str) -> None: ...
