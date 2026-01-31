# 开发文档

- [开发环境准备](#开发环境准备)
- [服务启动](#服务启动)
- [测试运行](#测试运行)

## 开发环境准备

1. 创建 Python 虚拟环境
```bash
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows
```

2. 安装后端依赖
```bash
pip install -r requirements-test.txt
```

3. 安装前端依赖
```bash
npm install
```

4. 安装 Playwright 浏览器（用于测试）
```bash
npx playwright install
```

5. 准备 opensandbox 依赖
```bash
mkdir external
git clone https://github.com/alibaba/OpenSandbox.git ./external/OpenSandbox
# 安装 opensandbox 依赖的 docker
sudo apt install docker.io
```

## 服务启动

启动 sandbox 服务
```bash
cp ./test/config/sandbox.toml ~/.sandbox.toml
cd external/OpenSandbox/server && uv run python -m src.main
```

启动后端：
```bash
DEV_MODE=true python src/backend/main.py ./examples
```

启动前端：
```bash
npm run dev
```

访问地址：
- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8080/health

注意：这里后端服务和前端服务均支持热加载，修改代码后无需重启服务

## 测试运行

## 开发环境准备

**环境设置**

1. 创建 Python 虚拟环境
```bash
python3 -m venv .venv
source .venv/bin/activate  # Linux/Mac
# .venv\Scripts\activate   # Windows
```

2. 安装后端依赖
```bash
pip install -r requirements-test.txt
```

3. 安装前端依赖
```bash
npm install
```

4. 安装 Playwright 浏览器（用于测试）
```bash
npx playwright install
```

5. 准备 opensandbox 依赖
```bash
mkdir external
git clone https://github.com/alibaba/OpenSandbox.git ./external/OpenSandbox
# 安装 opensandbox 依赖的 docker
sudo apt install docker.io
```

## 服务启动

启动 sandbox 服务
```bash
cp ./test/config/sandbox.toml ~/.sandbox.toml
cd external/OpenSandbox/server && uv run python -m src.main
```

启动后端：
```bash
DEV_MODE=true python src/backend/main.py ./docs
```

启动前端：
```bash
npm run dev
```

访问地址：
- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8080/health

注意：这里后端服务和前端服务均支持热加载，修改代码后无需重启服务

## 测试运行

运行单元测试：
```bash
pytest ./test/python
```

运行集成测试：

```bash
npm test
```

运行特定测试：
```bash
npx playwright test test/terminal.spec.js
npx playwright test test/api.spec.js
```

## 常见问题

1. Failed to initialize Docker service: Error while fetching server API version: ('Connection aborted.', PermissionError(13, 'Permission denied'))

启动 sandbox 服务报错
```
Traceback (most recent call last):
  File "/usr/lib/python3.10/runpy.py", line 196, in _run_module_as_main
    return _run_code(code, main_globals, None,
  File "/usr/lib/python3.10/runpy.py", line 86, in _run_code
    exec(code, run_globals)
  File "/home/admin/Desktop/scriptbook/external/OpenSandbox/server/src/main.py", line 63, in <module>
    from src.api.lifecycle import router  # noqa: E402
  File "/home/admin/Desktop/scriptbook/external/OpenSandbox/server/src/api/lifecycle.py", line 46, in <module>
    sandbox_service = create_sandbox_service()
  File "/home/admin/Desktop/scriptbook/external/OpenSandbox/server/src/services/factory.py", line 72, in create_sandbox_service
    return implementation_class(config=active_config)
  File "/home/admin/Desktop/scriptbook/external/OpenSandbox/server/src/services/docker.py", line 166, in __init__
    raise HTTPException(
fastapi.exceptions.HTTPException: 503: {'code': 'DOCKER::INITIALIZATION_ERROR', 'message': "Failed to initialize Docker service: Error while fetching server API version: ('Connection aborted.', PermissionError(13, 'Permission denied'))."}
```
当前用户无法访问 docker,通过变更权限的方式解决，比如：当前为 admin 用户
```bash
sudo chown admin:admin /var/run/docker.sock
```