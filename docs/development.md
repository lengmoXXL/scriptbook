# 开发文档

- [开发环境准备](#开发环境准备)
- [服务启动](#服务启动)
- [测试运行](#测试运行)

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

## 服务启动

启动后端（普通模式）：
```bash
python src/backend/main.py ./docs
```

启动后端（开发热重载模式）：
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
