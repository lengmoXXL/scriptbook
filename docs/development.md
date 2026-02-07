# 开发文档

- [开发环境准备](#开发环境准备)
- [服务启动](#服务启动)
- [测试运行](#测试运行)
- [常见问题](#常见问题)

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

5. 安装 Docker（用于本地 sandbox）
```bash
sudo apt install docker.io
sudo usermod -aG docker $USER  # 将当前用户加入 docker 组
```

## 服务启动

启动后端：
```bash
python src/backend/main.py examples --port 8080
```

启动前端：
```bash
npm run dev
```

访问地址：
- 后端：http://localhost:8080
- 前端：http://localhost:7771

注意：后端和前端服务均支持热加载，修改代码后无需重启服务

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

1. Docker 权限问题：Permission denied

当前用户无法访问 docker，通过变更权限的方式解决：
```bash
sudo chown $USER:$USER /var/run/docker.sock
```
或者重新登录以使 group 生效。
