# Claude Code 项目配置

- [项目结构](#项目结构)
- [注意事项](#注意事项)

## 项目结构

```
.
├── src/
│   ├── backend/      # Python 后端
│   │   └── agents/   # AI agents
│   └── frontend/     # Vue 前端
├── docs/             # 文档
│   ├── development.md  # 开发环境准备、服务启动、测试运行
│   ├── git.md          # git 提交标准流程
│   ├── release.md      # 发布 pypi 流程
│   └── style.md        # 项目规范（代码风格、注释规范等）
├── tools/             # 工具脚本
├── test/              # 测试
├── examples/          # 示例文件
├── .venv/             # Python 虚拟环境
├── package.json       # 前端配置
├── pyproject.toml     # Python 配置
├── pytest.ini         # 测试配置
├── playwright.config.js  # Playwright 配置
├── requirements.txt   # 后端依赖
├── vite.config.js     # Vite 配置
├── .gitignore         # Git 忽略
└── README.md
```

## 注意事项

@docs/style.md