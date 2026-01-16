# Scriptbook 发布流程

完成新功能开发后的版本发布步骤。

## 版本规则

- **主版本 (x.0.0)**: 不兼容的重大修改
- **次版本 (x.y.0)**: 新功能（向后兼容）
- **修订版本 (x.y.z)**: 问题修正和小改进

## 发布前检查清单

- [ ] 所有测试通过
- [ ] 文档已更新
- [ ] 版本号已修改
- [ ] CHANGELOG 已添加新版本记录
- [ ] 无临时文件和调试代码

## 发布步骤

### 1. 更新版本号

修改 2 个文件：

```bash
# pyproject.toml
version = "x.y.z"

# src/backend/__init__.py
__version__ = "x.y.z"
```

### 2. 更新文档

#### README.md / README_en.md
- 功能特性列表添加新功能
- 版本信息更新为当前版本

#### CHANGELOG.md
在顶部添加新版本条目：

```markdown
## [x.y.z] - YYYY-MM-DD

### ✨ 新增功能
- 功能描述

### 🐛 错误修复
- 问题描述

### 🧪 测试增强
- 测试描述
```

#### CLAUDE.md（需要时）
- 更新项目结构

### 3. 代码清理

```bash
# 删除临时文件
rm -f *.log *.tmp
rm -f docs/testing/test-*.html
rm -f docs/testing/*FIX*.md

# 清理缓存
find . -name "__pycache__" -type d -exec rm -rf {} +
find . -name "*.pyc" -delete
rm -rf .pytest_cache
```

### 4. 运行测试

```bash
# Python 测试
pytest src/backend/tests/ -v

# Playwright E2E 测试
npx playwright test
```

所有测试必须通过后才能继续。

### 5. 提交更改

```bash
git add .
git commit -m "release: v1.x.x - 功能描述"
git push
```

### 6. 发布到 PyPI

```bash
# 构建包
python -m build

# 上传到 PyPI
twine upload dist/*
```

### 7. Git Tag（可选）

```bash
git tag v1.x.x
git push origin v1.x.x
```

## 发布后

1. 检查 PyPI 页面是否正常
2. 验证 pip 安装：`pip install scriptbook==x.y.z`
3. 更新 GitHub Release（如使用）

## 回滚步骤

如果发布后发现严重问题：

```bash
# 1. 修复代码
git checkout -b fix/rollback-v1.x.x

# 2. 更新版本号
# 修改 pyproject.toml 和 src/backend/__init__.py

# 3. 提交修复
git commit -m "fix: 回滚修复 v1.x.y"

# 4. 发布新版本
python -m build && twine upload dist/*
```

## 快速参考

```bash
# 版本号检查
cat pyproject.toml | grep version
cat src/backend/__init__.py | grep __version__

# 运行测试
pytest src/backend/tests/ -v && npx playwright test

# 构建并发布
python -m build && twine upload dist/*
```

---

**关键点：版本号一致 | 测试通过 | 文档完整 | PyPI 发布成功**
