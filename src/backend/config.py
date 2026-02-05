"""Configuration for sandbox providers."""

from pydantic import BaseModel


class SandboxConfig(BaseModel):
    """Configuration for sandbox providers."""
    # Default provider when not specified in create request
    default_provider: str = "local_docker"
    opensandbox_domain: str = "localhost:8081"
    default_image: str = "sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1"
    local_docker_timeout_minutes: int = 15  # 默认 15 分钟超时
