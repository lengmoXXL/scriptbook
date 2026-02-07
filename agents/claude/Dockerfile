FROM ac2-registry.cn-hangzhou.cr.aliyuncs.com/ac2/base:alinux3.2104-py310

# Install system dependencies
RUN yum install -y git bash nc && yum clean all

# Create workspace directory
WORKDIR /workspace

# Install claude-agent-sdk
RUN pip install --no-cache-dir claude-agent-sdk

# Set up environment
ENV PYTHONUNBUFFERED=1
