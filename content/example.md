# Markdown脚本执行示例

这是一个展示脚本执行功能的markdown文件。

## 基本命令

下面是一个简单的bash脚本：

```bash
echo "当前目录文件列表："
ls -la
```

## 系统信息

查看系统信息：

```bash
echo "系统信息："
uname -a
echo ""
echo "内存使用："
free -h
```

## 网络检查

检查网络连接：

```bash
echo "测试网络连接..."
ping -c 3 google.com
```

## 文件操作

创建和删除测试文件：

```bash
echo "创建测试文件："
echo "Hello from script" > test.txt
cat test.txt
echo ""
echo "删除测试文件："
rm test.txt
echo "文件已删除"
```

## 结束

所有脚本都可以通过点击旁边的"执行"按钮来运行。