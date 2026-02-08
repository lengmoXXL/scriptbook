FROM ac2-registry.cn-hangzhou.cr.aliyuncs.com/ac2/base:alinux3.2104-py310

# Install system dependencies (include nodejs and npm for iFlow CLI)
RUN yum install -y nc curl nodejs npm && yum clean all

# Install iFlow CLI via npm
RUN npm install -g @iflow-ai/iflow-cli@latest

# Create workspace directory
WORKDIR /workspace

# Upgrade pip and install iflow-cli-sdk
RUN pip install --upgrade pip && \
    pip install --no-cache-dir iflow-cli-sdk

# Set up environment
ENV PYTHONUNBUFFERED=1
