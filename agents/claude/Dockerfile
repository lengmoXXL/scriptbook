FROM sandbox-registry.cn-zhangjiakou.cr.aliyuncs.com/opensandbox/code-interpreter:v1.0.1

RUN apt-get update && apt-get install -y netcat-openbsd && rm -rf /var/lib/apt/lists/* \
    && npm install -g @anthropic-ai/claude-code@latest \
    && uv pip install --system --break-system-packages claude-agent-sdk -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY entrypoint.py /app/entrypoint.py

ENTRYPOINT ["python3", "/app/entrypoint.py"]
