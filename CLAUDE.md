# Scriptbook 项目结构

## 项目概述

Scriptbook 是一个支持脚本执行的 Markdown 服务器，提供结果持久化和停止功能。

## 文档体系

```
docs/
├── development.md    # 开发指南（环境搭建、日常开发、测试、文档更新）
├── release.md        # 发布流程（版本发布步骤和检查清单）
├── changelog.md      # 版本变更记录
└── screenshot.png    # 界面截图
```

## 核心流程文档

| 文档 | 用途 |
|------|------|
| `docs/development.md` | 本地开发环境搭建和日常开发流程 |
| `docs/release.md` | 版本发布步骤和检查清单 |
| `docs/changelog.md` | 完整的版本变更记录 |

## 目录结构

```
scriptbook/
├── examples/              # 示例Markdown文件目录
│   ├── example.md         # 主示例文档
│   ├── test_cases.md      # 测试用例
│   ├── test_interactive.md # 交互式测试
│   ├── ansi_examples.md   # ANSI颜色示例
│   └── markdown-syntax.md # Markdown语法演示
│
├── docs/                  # 项目文档
│   ├── development.md     # 开发指南
│   ├── release.md         # 发布流程
│   ├── changelog.md       # 更新日志
│   └── screenshot.png     # 界面截图
│
├── src/                   # 源代码
│   ├── backend/           # 后端 (Python/FastAPI)
│   │   ├── __init__.py    # 包初始化，版本信息
│   │   ├── main.py        # FastAPI应用入口
│   │   ├── cli.py         # 命令行接口
│   │   ├── core/          # 核心功能
│   │   │   ├── file_scanner.py      # 文件扫描
│   │   │   ├── markdown_parser.py   # Markdown解析
│   │   │   ├── plugin_manager.py    # 插件管理
│   │   │   └── script_executor.py   # 脚本执行
│   │   ├── models/        # 数据模型
│   │   │   └── schemas.py # Pydantic模式
│   │   ├── routers/       # API路由
│   │   │   ├── markdown.py    # Markdown相关API
│   │   │   ├── plugins.py     # 插件相关API
│   │   │   └── scripts.py     # 脚本执行API
│   │   └── plugins/       # 主题插件
│   │       ├── theme-github/
│   │       └── theme-github-dark/
│   │
│   ├── frontend/          # 前端 (Vue 3/Vite)
│   │   ├── index.html     # 主页面
│   │   ├── js/            # JavaScript
│   │   │   ├── main.js            # 主入口
│   │   │   ├── app.js             # 主应用逻辑
│   │   │   ├── plugin-loader.js   # 插件加载器
│   │   │   ├── terminal-manager.js # 终端管理器
│   │   │   ├── components/        # Vue组件
│   │   │   │   ├── App.vue        # 主应用组件
│   │   │   │   └── TerminalModal.vue # 终端弹窗组件
│   │   │   └── lib/               # 第三方库
│   │   │       ├── xterm.js
│   │   │       └── xterm.css
│   │   ├── css/
│   │   │   └── main.css
│   │   └── plugins/       # 主题插件
│   │       ├── theme-github/
│   │       └── theme-github-dark/
│   │
│   └── tests/             # Python 单元测试
│       ├── __init__.py    # 包初始化
│       ├── conftest.py    # pytest 配置
│       ├── test_file_scanner.py
│       ├── test_markdown_parser.py
│       ├── test_plugin_manager.py
│       ├── test_report.py
│       └── test_script_executor.py
│
├── dist/                  # Vite 构建产物（项目根目录）
│   ├── index.html
│   ├── js/
│   ├── css/
│   └── plugins/           # 主题插件
│       ├── theme-github/
│       └── theme-github-dark/
│
├── test/                  # Playwright 测试
│   ├── e2e.test.mjs       # 端到端测试
│   └── integration.test.mjs # 集成测试
│
├── pyproject.toml         # 项目配置和依赖
├── requirements.txt       # 生产依赖
├── requirements-test.txt  # 测试依赖
├── README.md              # 项目说明（中文）
├── README_en.md           # 项目说明（英文）
└── CLAUDE.md              # 项目结构说明
```

## 核心文件说明

### 后端 (Python)
- **`main.py`**: FastAPI 应用入口
- **`routers/scripts.py`**: WebSocket 脚本执行
- **`core/markdown_parser.py`**: Markdown 解析
- **`core/script_executor.py`**: 脚本执行器

### 前端 (Vue 3)
- **`frontend/js/components/App.vue`**: 主应用组件（Vue 3 组合式 API）
- **`frontend/js/components/TerminalModal.vue`**: 终端弹窗组件
- **`frontend/js/terminal-manager.js`**: 终端管理器
- **`frontend/css/main.css`**: 主样式

### 测试 (70+)
- **Python 单元测试**: 74 个（pytest, 位于 `src/backend/tests/`）
- **Playwright E2E 测试**: 前端 E2E 测试

## 主要功能

1. **脚本执行**: 通过 WebSocket 实时执行 bash 脚本
2. **结果持久化**: localStorage 保存，页面刷新后恢复
3. **停止功能**: 红色按钮立即终止脚本执行
4. **交互式输入**: 支持 stdin 双向通信
5. **主题切换**: GitHub Light / GitHub Dark
6. **终端弹窗**: 脚本执行在独立弹窗中进行

## 技术栈

- **后端**: Python 3.10+ / FastAPI / WebSocket
- **前端**: Vue 3 (Composition API) / Vite / xterm.js
- **测试**: pytest / Playwright

## 许可证

MIT License
