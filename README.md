# Scriptbook - 可执行脚本的 Markdown 服务器

[English](README_en.md)

一个支持脚本执行的在线 Markdown 服务器。借鉴 Jupyter Notebook 的设计理念，支持在 Markdown 文档中嵌入并执行脚本，非常适合 SOP（标准操作流程）自动化和交互式文档场景。

## 功能特性

- **交互式文档** - 在Markdown中嵌入可执行脚本，类似Jupyter Notebook
- **交互式输入** - 支持在脚本执行过程中接收用户输入（如`read`命令）
- **实时执行** - WebSocket实现脚本实时输出流
- **结果持久化** - 页面刷新后自动恢复脚本执行结果（使用localStorage）
- **停止执行** - 支持随时终止正在执行的脚本
- **多文档支持** - 支持多个文档切换，结果独立保存
- **主题切换** - 支持 GitHub Light 和 GitHub Dark 两种主题
- **终端弹窗** - 脚本执行在独立弹窗中进行，支持全屏交互
- **ANSI颜色支持** - 脚本输出的颜色和格式在浏览器中正确显示
- **SOP自动化** - 适用于企业标准操作流程的展示和执行
- **完整测试** - 包含 200+ 测试用例，涵盖单元测试、集成测试和端到端测试

### 技术栈

- **后端**: Python 3.10+ / FastAPI / WebSocket
- **前端**: Vue 3 (组合式 API) / Vite / xterm.js
- **测试**: Jest / pytest / Playwright

## 截图预览

![Scriptbook界面截图](docs/screenshot-2025-12-25.png)

## 快速开始

### 环境要求
- Python 3.10+
- 现代浏览器

### 安装

```bash
# 直接安装（推荐）
pip install scriptbook

# 或者从源码安装
git clone https://github.com/lengmoXXL/scriptbook.git
cd scriptbook
pip install .
```

### 使用方法

```bash
# 启动服务（使用默认examples目录）
scriptbook examples/

# 指定自定义文档目录
scriptbook /path/to/my/documents/

# 指定端口
scriptbook examples/ --port 9000

# 允许外部访问
scriptbook examples/ --host 0.0.0.0

# 访问应用
open http://localhost:8000
```

**注意**: 修改代码后请手动重启服务以应用更改。

## 发布信息

### PyPI安装

```bash
pip install scriptbook
```

**PyPI链接**: https://pypi.org/project/scriptbook/

### 版本

- 当前版本: 1.6.2
- Python要求: >=3.10
- 详细更新日志: [changelog.md](docs/changelog.md)

### 许可证

MIT License

### GitHub仓库

- 源码: https://github.com/lengmoXXL/scriptbook
- 问题反馈: https://github.com/lengmoXXL/scriptbook/issues

## 测试

本项目包含 100+ 测试用例（后端单元测试 + E2E 测试）。

### 测试类型

#### 1. Python 单元测试 (70+)
使用 pytest 运行：
```bash
pytest src/backend/tests/ -v
```

#### 2. Playwright E2E 测试
使用 Playwright 进行真实浏览器测试：
```bash
# 安装 Playwright
npm install -D @playwright/test playwright

# 运行测试
npx playwright test
```

### 测试覆盖

- 文件扫描和 Markdown 解析
- 插件管理系统
- 脚本执行器
- WebSocket 事件处理
- 交互式输入功能
- 主题切换
- 终端弹窗交互

## 开发指南

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/lengmoXXL/scriptbook.git
cd scriptbook

# 创建虚拟环境
python -m venv .venv
source .venv/bin/activate

# 安装依赖
pip install -e .
pip install -r requirements-test.txt

# 运行测试
pytest src/backend/tests/ -v
```

### 前端开发

```bash
# 安装 Node.js 依赖
npm install

# 启动开发服务器（Vite）
npm run dev

# 构建生产版本
npm run build
```

前端技术栈：
- **Vue 3** - 使用组合式 API
- **Vite** - 构建工具
- **xterm.js** - 终端模拟器

### 发布到PyPI

```bash
# 构建包
python -m build

# 上传到PyPI
twine upload dist/*
```

或者使用GitHub Actions进行自动发布。

---

**Scriptbook** - 让文档更易于理解和执行
