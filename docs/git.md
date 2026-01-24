# git 提交标准流程

1. 执行 tools/gen_toc.py 确保所有的 markdown 文件都有目录
2. 执行 npm test 运行集成测试
3. 执行 pytest ./test/python 运行单元测试
4. 参考 style.md 检查文件是否满足要求
5. 总结当前修改内容，以标准的格式使用 git 提交