# 发布 pypi 流程

1. 检查是否存在未提交到 git 的修改，如果有流程终止
2. 参考 development.md 执行测试，如果测试不通过，流程终止
3. 更新发布版本号，提交 git
4. 执行发布脚本

```bash
npm run build
python -m build
twine upload dist/**
```