#!/usr/bin/env python3
"""遍历所有 md 文件，生成 TOC"""

import re
from pathlib import Path

def extract_toc(filepath):
    """从文件提取标题生成 TOC"""
    toc_lines = []

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 查找所有标题 (## 开头)
    for line in content.split('\n'):
        match = re.match(r'^(#{2,4})\s+(.+)$', line)
        if match:
            level = len(match.group(1))
            title = match.group(2).strip()
            anchor = title.lower().replace(' ', '-')
            indent = '  ' * (level - 2)
            toc_lines.append(f"{indent}- [{title}](#{anchor})")

    return '\n'.join(toc_lines)

def add_toc_to_file(filepath):
    """为文件添加 TOC"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    toc = extract_toc(filepath)

    # 删除已有的 TOC（从开头的列表到第一个标题）
    lines = content.split('\n')
    new_lines = []
    in_toc = False
    for line in lines:
        if line.startswith('- ['):
            in_toc = True
            continue
        if in_toc and line.startswith('- '):
            continue
        if in_toc and line.strip() == '':
            continue
        in_toc = False
        new_lines.append(line)

    new_content = '\n'.join(new_lines)

    # 在第一个 H2 标题前插入 TOC
    new_content = re.sub(r'(\n##\s+\S)', f'\n{toc}\n\\1', new_content, count=1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"更新: {filepath}")

def main():
    md_files = Path('.').rglob('*.md')
    for md in md_files:
        if '.git' in str(md):
            continue
        add_toc_to_file(md)

if __name__ == '__main__':
    main()
