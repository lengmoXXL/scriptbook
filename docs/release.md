# 发布 pypi 流程

1. 检查是否存在未提交到 git 的修改，如果有流程终止
2. 参考 development.md 执行测试，如果测试不通过，流程终止
3. 更新发布版本号（根据上次发布的 git 日志决定更新哪个版本），提交 git

```bash
git log --oneline | grep release
```

4. 执行发布脚本

```bash
source ./.venv/bin/activate
npm run build
python -m build
twine upload dist/**
```