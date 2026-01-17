# Scriptbook 开发指南

本地开发环境搭建和日常开发流程。

## 环境要求

- Python 3.10+
- Node.js 18+
- Git

## 初始设置

```bash
# 克隆仓库
git clone https://github.com/lengmoXXL/scriptbook.git
cd scriptbook

# 创建 Python 虚拟环境
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
# .venv\Scripts\activate   # Windows

# 安装 Python 依赖
pip install -e .
pip install -r requirements-test.txt

# 安装 Node.js 依赖
npm install
```

## 开发命令

### 后端开发

```bash
# 激活虚拟环境
source .venv/bin/activate

# 启动服务（使用 examples 目录）
scriptbook examples/

# 指定端口
scriptbook examples/ --port 9000

# 允许外部访问
scriptbook examples/ --host 0.0.0.0

# 修改代码后需重启服务
```

### 前端开发

```bash
# 构建前端 js 文件

npm run build
```

> **重要**：修改 `src/frontend/` 下的 Vue 文件后，必须运行 `npm run build` 将构建产物更新到 `dist/` 目录，否则后端服务无法加载最新前端代码。

前端源码位于 `src/frontend/`：
- `index.html` - 主页面
- `js/components/` - Vue 组件
- `css/` - 样式文件
- `plugins/` - 主题插件

## 项目结构

```
scriptbook/
├── src/
│   ├── backend/           # 后端 (Python/FastAPI)
│   │   ├── main.py        # FastAPI 应用入口
│   │   ├── cli.py         # 命令行接口
│   │   ├── core/          # 核心功能模块
│   │   │   ├── file_scanner.py
│   │   │   ├── markdown_parser.py
│   │   │   ├── plugin_manager.py
│   │   │   └── script_executor.py
│   │   ├── routers/       # API 路由
│   │   │   ├── markdown.py
│   │   │   ├── plugins.py
│   │   │   └── scripts.py
│   │   ├── models/        # 数据模型
│   │   │   └── schemas.py
│   │   └── plugins/       # 主题插件
│   │
│   ├── frontend/          # 前端 (Vue 3/Vite)
│   │   ├── index.html
│   │   ├── js/
│   │   ├── css/
│   │   └── plugins/
│   │
│   └── tests/             # Python 单元测试
│       └── test_*.py
│
├── dist/                  # Vite 构建产物（项目根目录）
├── examples/              # 示例文档
└── test/                  # Playwright 测试
```

## 开发规范

### Git 工作流

```bash
# 创建功能分支
git checkout -b feature/xxx

# 提交规范
git commit -m "feat: 新功能描述"
git commit -m "fix: 问题修复"
git commit -m "docs: 文档更新"
git commit -m "refactor: 代码重构"

# 推送到远程
git push -u origin feature/xxx
```

### 代码风格

- Python: PEP 8，使用 ruff 或 black 格式化
- JavaScript: ESLint + Prettier
- Vue 组件: 使用组合式 API (`<script setup>` 或 `defineComponent`)

### 测试要求

- 新功能需添加对应的测试
- 运行测试确保通过后再提交

## 测试

项目包含 100+ 测试用例（后端单元测试 + E2E 测试）。

### 测试类型

| 类型 | 框架 | 位置 | 命令 |
|------|------|------|------|
| Python 单元测试 | pytest | `src/backend/tests/` | `pytest src/backend/tests/ -v` |
| Playwright E2E | Playwright | `test/` | `npx playwright test` |

### 运行测试

```bash
# Python 单元测试
pytest src/backend/tests/ -v

# Playwright E2E 测试
npx playwright test
```

### 测试文件

| 文件 | 测试内容 |
|------|----------|
| `src/backend/tests/test_*.py` | Python 单元测试 (70+) |
| `test/features.test.mjs` | Playwright E2E 测试 |
| `test/script-state.test.mjs` | 脚本状态和终端测试 |

### MCP 测试

项目集成了 MCP (Model Context Protocol) 测试工具，支持通过截图验证 UI 的一致性。

#### 环境要求

确保 MCP 工具已配置，参考 [MCP Chrome DevTools 文档](https://github.com/anthropics/mcp-chrome-devtools)。

#### 运行 MCP 测试

```bash
# 启动 scriptbook 服务
scriptbook examples/

# 运行 MCP 测试脚本
node test/mcp-theme.test.js
```

#### MCP 测试用例

##### TC-001: 终端弹窗主题配色一致性

**目标**: 验证脚本执行弹窗的配色与当前主题一致

**步骤**:
1. 访问 http://localhost:8000
2. 选择任意包含脚本的 Markdown 文件（如 `example.md`）
3. 点击任意脚本块右侧的「执行」按钮
4. 等待终端弹窗完全打开
5. 使用 MCP 工具截图
6. 验证弹窗配色与主题一致

**预期结果**:
- GitHub Light 主题: 弹窗背景为白色或浅灰色，文字为深色
- GitHub Dark 主题: 弹窗背景为深色 (#0d1117)，文字为浅色 (#c9d1d9)

**截图验证命令**:
```javascript
// 截图并保存
await chromeDevTools.takeScreenshot({ filePath: 'test-results/modal-theme-check.png' })

// 验证弹窗元素存在
const snapshot = await chromeDevTools.takeSnapshot()
const modal = snapshot.uid_of_terminal_modal  // 检查终端弹窗存在
```

## 文档更新

当添加新功能或修改代码后，需要更新相关文档。

### 需要更新的文档

| 文档 | 更新场景 |
|------|----------|
| `README.md` / `README_en.md` | 新功能、新测试、版本发布 |
| `CHANGELOG.md` | 任何版本变更 |
| `docs/development.md` | 开发流程、环境配置变更 |
| `CLAUDE.md` | 项目结构变更 |

### 文档更新流程

1. **添加新功能后**
   ```bash
   # 1. 更新 README 功能特性列表
   # 2. 在 CHANGELOG.md 顶部添加新条目
   # 3. 提交: git commit -m "docs: 更新文档"
   ```

2. **更新 README 示例**
   ```markdown
   ## 功能特性

   - **新功能名称** - 功能描述
   ```

3. **更新 CHANGELOG**
   ```markdown
   ## [x.y.z] - YYYY-MM-DD

   ### ✨ 新增功能
   - 功能描述

   ### 🐛 错误修复
   - 问题描述

   ### 🧪 测试增强
   - 测试描述
   ```

4. **更新 CLAUDE.md**
   - 新增文件/目录需添加到目录结构
   - 新增技术栈需添加到技术栈说明

### 提交文档更改

```bash
git add README.md README_en.md CHANGELOG.md docs/
git commit -m "docs: 文档更新 - 变更说明"
```

## 常用操作

### 添加依赖

```bash
# Python 依赖
# 编辑 pyproject.toml 的 dependencies 部分
pip install -e .

# Node.js 依赖
npm install <package>
```

### 清理缓存

```bash
# Python 缓存
find . -name "__pycache__" -type d -exec rm -rf {} +
find . -name "*.pyc" -delete

# Node.js 缓存
npm cache clean --force
```

### 版本号检查

```bash
cat pyproject.toml | grep version
cat src/backend/__init__.py | grep __version__
```
