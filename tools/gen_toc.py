#!/usr/bin/env python3
"""遍历所有 md 文件，生成 TOC"""

import re
from pathlib import Path

TITLE_RE = re.compile(r'^(#{2,4})\s+(.+)$', re.MULTILINE)
TOC_START_RE = re.compile(r'^-\s+\[')
H2_RE = re.compile(r'\n##\s+\S')

def process_file(filepath):
    """处理单个文件"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # 提取所有标题
    titles = []
    for match in TITLE_RE.finditer(content):
        level = len(match.group(1))
        title = match.group(2).strip()
        anchor = title.lower().replace(' ', '-')
        indent = '  ' * (level - 2)
        titles.append(f"{indent}- [{title}](#{anchor})")

    if not titles:
        return

    toc = '\n'.join(titles)

    # 删除已有 TOC
    lines = content.split('\n')
    new_lines = []
    in_toc = False
    for line in lines:
        if TOC_START_RE.match(line):
            in_toc = True
            continue
        if in_toc and line.startswith('- '):
            continue
        if in_toc and line.strip() == '':
            continue
        in_toc = False
        new_lines.append(line)

    new_content = '\n'.join(new_lines)

    # 插入新 TOC
    match = H2_RE.search(new_content)
    if match:
        pos = match.start()
        new_content = new_content[:pos] + f'\n{toc}\n' + new_content[pos:]

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"更新: {filepath}")

def main():
    for md in Path('.').rglob('*.md'):
        path = str(md)
        if '.git' in path or 'node_modules' in path or 'examples' in path or 'agents' in path:
            continue
        process_file(md)

if __name__ == '__main__':
    main()
