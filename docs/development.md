# 开发文档

- [开发环境准备](#开发环境准备)

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

**启动服务**

启动后端：
```bash
cd src/backend
python main.py --docs-dir /path/to/markdown
```

启动前端：
```bash
npm run dev
```

访问地址：
- 前端：http://localhost:5173
- 后端健康检查：http://localhost:8080/health

**测试运行**

运行所有测试：
```bash
pytest ./test/python
npm test
```

运行特定测试：
```bash
npx playwright test test/terminal.spec.js
npx playwright test test/api.spec.js
```

查看测试报告：
```bash
npx playwright show-report
```
