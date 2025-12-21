import json
from sop_online.core.markdown_parser import MarkdownParser


class TestMarkdownParser:
    """测试Markdown解析器"""

    def setup_method(self):
        """每个测试方法前的设置"""
        self.parser = MarkdownParser()

    def test_initialization(self):
        """测试初始化"""
        assert self.parser.script_pattern is not None

    def test_extract_scripts_empty(self):
        """测试提取空文本中的脚本块"""
        text = "没有脚本的普通文本。"
        cleaned, scripts = self.parser.extract_scripts(text)

        assert cleaned == text
        assert scripts == []

    def test_extract_scripts_single_script(self):
        """测试提取单个脚本块"""
        text = """# 文档标题

一些文本。

```bash {"id": "test1", "title": "测试脚本"}
echo "Hello"
ls -la
```

更多文本。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        # 检查清理后的文本
        assert "[脚本块: test1 - 测试脚本]" in cleaned
        assert "```bash" not in cleaned

        # 检查脚本块
        assert len(scripts) == 1
        script = scripts[0]
        assert script.id == "test1"
        assert script.title == "测试脚本"
        assert script.language == "bash"
        assert script.code == 'echo "Hello"\nls -la'
        assert script.line_start >= 0
        assert script.line_end > script.line_start

    def test_extract_scripts_multiple_scripts(self):
        """测试提取多个脚本块"""
        text = """# 文档

```bash {"id": "bash1", "title": "Bash脚本1"}
echo "Hello"
```

中间文本。

```bash {"id": "bash2", "title": "Bash脚本2"}
echo "World"
```

结尾。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        # 检查清理后的文本
        assert "[脚本块: bash1 - Bash脚本1]" in cleaned
        assert "[脚本块: bash2 - Bash脚本2]" in cleaned
        assert "```bash" not in cleaned

        # 检查脚本块
        assert len(scripts) == 2

        bash_script1 = scripts[0]
        assert bash_script1.id == "bash1"
        assert bash_script1.title == "Bash脚本1"
        assert bash_script1.language == "bash"
        assert bash_script1.code == 'echo "Hello"'

        bash_script2 = scripts[1]
        assert bash_script2.id == "bash2"
        assert bash_script2.title == "Bash脚本2"
        assert bash_script2.language == "bash"
        assert bash_script2.code == 'echo "World"'

    def test_extract_scripts_no_metadata(self):
        """测试没有元数据的脚本块（智能生成title）"""
        text = """# 文档

```bash
echo "Default"
```

结束。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        # 检查清理后的文本
        assert "[脚本块: script_0 - Default]" in cleaned

        # 检查脚本块
        assert len(scripts) == 1
        script = scripts[0]
        assert script.id == "script_0"  # 自动生成的ID
        assert script.title == "Default"  # 智能生成的标题（从echo中提取）
        assert script.language == "bash"
        assert script.code == 'echo "Default"'

    def test_extract_scripts_invalid_json_metadata(self):
        """测试无效JSON元数据"""
        text = """# 文档

```bash {"id": test1, title: "测试"}
echo "Hello"
```

结束。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        # 应该使用默认值
        assert len(scripts) == 1
        script = scripts[0]
        assert script.id == "script_0"  # 自动生成的ID
        assert script.title == "bash脚本"  # 默认标题

    def test_extract_scripts_partial_metadata(self):
        """测试部分元数据（只有id，没有title）"""
        text = """# 文档

```bash {"id": "custom_id"}
echo "Partial metadata"
```

结束。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        assert len(scripts) == 1
        script = scripts[0]
        assert script.id == "custom_id"  # 自定义ID
        assert script.title == "Partial metadata"  # 智能生成的标题
        assert script.code == 'echo "Partial metadata"'

    def test_extract_scripts_with_code_containing_backticks(self):
        """测试代码中包含反引号的脚本块"""
        text = r"""# 文档

```bash {"id": "test1", "title": "包含反引号"}
echo "This contains \`backticks\`"
echo 'And \`more\` backticks'
```

结束。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        assert len(scripts) == 1
        script = scripts[0]
        assert r"contains \`backticks\`" in script.code
        assert r"And \`more\` backticks" in script.code

    def test_extract_scripts_multiline_code(self):
        """测试多行代码的脚本块"""
        text = """# 文档

```bash {"id": "multiline", "title": "多行脚本"}
echo "Line 1"
echo "Line 2"
echo "Line 3"

if [ true ]; then
    echo "Conditional"
fi
```

结束。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        assert len(scripts) == 1
        script = scripts[0]
        lines = script.code.split('\n')
        assert len(lines) >= 7
        assert "Line 1" in script.code
        assert "Conditional" in script.code

    def test_extract_scripts_preserves_original_text_structure(self):
        """测试保持原始文本结构"""
        text = """第一段。

```bash {"id": "s1", "title": "脚本1"}
echo "Script 1"
```

第二段。

```bash {"id": "s2", "title": "脚本2"}
echo "Script 2"
```

第三段。"""

        cleaned, scripts = self.parser.extract_scripts(text)

        # 检查段落顺序
        parts = cleaned.split('[脚本块:')
        assert len(parts) == 3  # 两个脚本块占位符 + 最后一部分
        assert "第一段" in parts[0]
        assert "第二段" in parts[1]
        assert "第三段" in parts[2]

    def test_parse_method(self):
        """测试parse方法"""
        text = """# 标题

```bash {"id": "test", "title": "测试"}
echo "Hello"
```

文本。"""

        result = self.parser.parse(text)

        assert "html" in result
        assert "scripts" in result
        assert len(result["scripts"]) == 1
        assert result["scripts"][0].id == "test"

        # 由于没有实际渲染Markdown，html应该包含清理后的文本
        assert "[脚本块: test - 测试]" in result["html"]

    def test_script_pattern_matching(self):
        """测试正则表达式匹配"""
        test_cases = [
            # 标准格式
            ('```bash {"id": "test", "title": "测试"}\necho "Hello"\n```', True),
            # 没有元数据
            ('```bash\necho "Hello"\n```', True),
            # sh和shell也应该匹配
            ('```sh\necho "Hello"\n```', True),
            ('```shell\necho "Hello"\n```', True),
            # 不同语言 - 不应该匹配
            ('```python\nprint("Hi")\n```', False),
            ('```javascript\nconsole.log("Hi")\n```', False),
            # 无效格式
            ('```\necho "Hello"\n```', False),  # 没有语言，不应该匹配
            ('echo "Hello"', False),  # 没有代码块标记
            ('``bash\necho "Hello"\n``', False),  # 只有两个反引号
        ]

        for text, should_match in test_cases:
            match = self.parser.script_pattern.search(text)
            if should_match:
                assert match is not None, f"应该匹配: {text}"
            else:
                assert match is None, f"不应该匹配: {text}"

    def test_extract_scripts_with_whitespace_variations(self):
        """测试不同空白字符格式"""
        variations = [
            # 标准格式
            '```bash {"id": "test1", "title": "测试"}\necho "Hello"\n```',
            # 额外空白
            '```bash {"id": "test2", "title": "测试"}  \n  echo "Hello"  \n  ```',
            # 元数据后换行
            '```bash {"id": "test3", "title": "测试"}\n\necho "Hello"\n\n```',
            # 紧凑格式
            '```bash{"id":"test4","title":"测试"}\necho "Hello"\n```',
        ]

        for i, text in enumerate(variations):
            cleaned, scripts = self.parser.extract_scripts(text)
            assert len(scripts) == 1, f"变体 {i+1} 应该提取一个脚本"
            script = scripts[0]
            assert script.id == f"test{i+1}"
            assert "Hello" in script.code