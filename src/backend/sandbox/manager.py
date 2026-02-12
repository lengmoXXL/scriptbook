"""Sandbox manager - unified interface for sandbox operations."""

import asyncio
import logging

from backend.config import SandboxConfig
from backend.sandbox.base import CommandResult, SandboxInfo
from backend.sandbox.local_docker import LocalDockerProvider


logger = logging.getLogger(__name__)


_singleton_manager: "SandboxManager | None" = None


def get_sandbox_manager() -> "SandboxManager":
    """Get singleton SandboxManager instance."""
    global _singleton_manager
    if _singleton_manager is None:
        _singleton_manager = SandboxManager(config=SandboxConfig())
    return _singleton_manager


class SandboxManager:
    """Unified manager for sandbox operations across all providers."""

    def __init__(self, config: SandboxConfig):
        self._config = config
        self._providers: dict[str, any] = {}
        # Track which provider owns each sandbox_id
        self._sandbox_provider_map: dict[str, str] = {}

    def _get_provider(self, provider_type: str = None):
        """Get or create a provider instance."""
        if provider_type is None:
            provider_type = self._config.default_provider

        if provider_type not in self._providers:
            if provider_type == "local_docker":
                self._providers[provider_type] = LocalDockerProvider(self._config)
            else:
                raise ValueError(f"Unknown provider type: {provider_type}")

            logger.info(f"Created provider: {provider_type}")

        return self._providers[provider_type]

    def _get_provider_for_sandbox(self, sandbox_id: str):
        """Get the provider that owns the given sandbox_id."""
        provider_type = self._sandbox_provider_map.get(sandbox_id)
        if provider_type is None:
            raise ValueError(f"Sandbox not found in cache: {sandbox_id}")
        return self._get_provider(provider_type)

    async def create_sandbox(
        self,
        provider: str = None,
        sandbox_id: str = None,
        image: str = None,
        init_commands: list[str] = None,
        env: dict[str, str] = None,
        expire_time: int = None,
        volumes: list[str] = None
    ) -> dict:
        """Create a new sandbox with specified provider."""
        provider = provider or self._config.default_provider
        provider_instance = self._get_provider(provider)
        handle = await provider_instance.create_sandbox(sandbox_id, image, init_commands, env, expire_time, volumes)

        # Register sandbox with its provider
        self._sandbox_provider_map[handle.id] = provider

        info = await handle.get_info()
        return {'id': handle.id, 'status': info.status, 'container_id': info.container_id}

    async def list_sandboxes(self) -> list[dict]:
        """List all sandboxes from all providers."""
        all_sandboxes = []
        # List from each provider
        for provider_type in ["local_docker"]:
            try:
                provider = self._get_provider(provider_type)
                sandboxes = await provider.list_sandboxes()
                for sb in sandboxes:
                    all_sandboxes.append({'id': sb.id, 'status': sb.status})
                    # Register sandbox with its provider if not already registered
                    if sb.id not in self._sandbox_provider_map:
                        self._sandbox_provider_map[sb.id] = provider_type
            except Exception as e:
                logger.warning(f"Error listing sandboxes from {provider_type}: {e}")
        return all_sandboxes

    async def get_sandbox_info(self, sandbox_id: str) -> dict:
        """Get sandbox info."""
        provider = self._get_provider_for_sandbox(sandbox_id)
        handle = await provider.get_sandbox(sandbox_id)
        info = await handle.get_info()
        return {
            'id': info.id,
            'status': info.status,
            'container_id': info.container_id
        }

    async def execute_command(self, sandbox_id: str, command: str) -> CommandResult:
        """Execute command in sandbox."""
        provider = self._get_provider_for_sandbox(sandbox_id)
        handle = await provider.get_sandbox(sandbox_id)
        return await handle.execute_command(command)

    async def kill_sandbox(self, sandbox_id: str) -> None:
        """Kill sandbox."""
        provider = self._get_provider_for_sandbox(sandbox_id)
        await provider.kill_sandbox(sandbox_id)
        # Unregister
        self._sandbox_provider_map.pop(sandbox_id, None)

    async def get_sandbox_handle(self, sandbox_id: str):
        """Get sandbox handle."""
        provider = self._get_provider_for_sandbox(sandbox_id)
        return await provider.get_sandbox(sandbox_id)
