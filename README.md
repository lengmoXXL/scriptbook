# Scriptbook - 可执行脚本的 Markdown 服务器

[English](README_en.md)

一个支持脚本执行的在线 Markdown 服务器。借鉴 Jupyter Notebook 的设计理念，支持在 Markdown 文档中嵌入并执行脚本，非常适合 SOP（标准操作流程）自动化和交互式文档场景。

## 功能特性

- **交互式文档** - 在Markdown中嵌入可执行脚本，类似Jupyter Notebook
- **交互式输入** - 支持在脚本执行过程中接收用户输入（如`read`命令）
- **实时执行** - WebSocket实现脚本实时输出流
- **独立输出** - 每个脚本块下方有独立的输出区域
- **多文档支持** - 支持多个文档切换
- **主题切换** - 支持明亮和暗色主题
- **SOP自动化** - 适用于企业标准操作流程的展示和执行
- **完整测试** - 包含102个单元测试和集成测试

## 截图预览

![Scriptbook界面截图](docs/screenshot.png)

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
# 启动服务（使用默认content目录）
scriptbook content/

# 指定自定义文档目录
scriptbook /path/to/my/documents/

# 指定端口
scriptbook content/ --port 9000

# 允许外部访问
scriptbook content/ --host 0.0.0.0

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

- 当前版本: 1.0.0
- Python要求: >=3.10

### 更新日志

#### v1.0.0 (2025-12-21)
- 项目重命名为 Scriptbook
- 新增交互式输入功能，支持在脚本执行过程中接收用户输入
- 新增25个JavaScript单元测试
- 重组测试目录结构，统一管理测试文件
- 优化WebSocket通信，支持stdin双向交互
- 所有102个测试全部通过

### 许可证

MIT License

### GitHub仓库

- 源码: https://github.com/lengmoXXL/scriptbook
- 问题反馈: https://github.com/lengmoXXL/scriptbook/issues

## 测试

本项目包含完整的测试套件，总计102个测试用例。

### 运行所有测试

```bash
# 运行所有测试（单元测试 + 集成测试）
pytest src/ src/integration_tests/ -v
```

### 分别运行测试

```bash
# Python 单元测试
pytest src/tests/ -v

# JavaScript 单元测试
cd src/tests/js
npm test

# 集成测试
pytest src/integration_tests/ -v
```

### 测试覆盖率

- **JavaScript 测试**: 25个测试用例（使用Jest + JSDOM）
- **Python 单元测试**: 64个测试用例
- **集成测试**: 13个测试用例
- **总测试数**: 102个，全部通过

测试覆盖：
- App类初始化和基本功能
- 全局函数（executeScript、copyCode、sendInput）
- WebSocket事件处理
- 文件扫描和Markdown解析
- 插件管理系统
- 脚本执行器
- 交互式输入功能

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

# 安装JavaScript测试依赖（仅测试需要）
cd src/tests/js
npm install

# 返回根目录
cd /path/to/scriptbook

# 运行所有测试
pytest src/ src/integration_tests/ -v
```

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
