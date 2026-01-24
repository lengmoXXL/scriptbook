#!/usr/bin/env python3
"""解析 markdown 文件并执行指定行号对应的 bash 脚本。

基于行号解析 markdown 文件，提取 bash 代码块（语言标识为 bash、sh、shell、zsh）。
支持通过行号指定要执行的脚本（可以是脚本范围内的任意行号）。
"""

import sys
import argparse
import subprocess
from pathlib import Path
from typing import List, Tuple

def extract_bash_scripts(content: str) -> List[Tuple[int, int, str, str]]:
    """提取 markdown 中的 bash 脚本块，返回 (起始行号, 结束行号, 语言, 代码)。"""
    lines = content.split('\n')
    scripts = []
    in_code_block = False
    current_lang = None
    current_code_lines = []
    start_line = 0
    end_line = 0

    for i, line in enumerate(lines, 1):  # 1-based 行号
        stripped = line.strip()

        # 检测代码块开始：```bash, ```sh, ```shell, ```zsh
        if stripped.startswith('```'):
            lang_part = stripped[3:].strip()  # 移除 ```
            if lang_part in ('bash', 'sh', 'shell', 'zsh'):
                if not in_code_block:
                    # 代码块开始
                    in_code_block = True
                    current_lang = lang_part
                    current_code_lines = []
                    start_line = i
            elif in_code_block and stripped == '```':
                # 代码块结束
                in_code_block = False
                end_line = i  # 结束行号是 ``` 所在的行
                code = '\n'.join(current_code_lines).strip()
                if code:
                    scripts.append((start_line, end_line, current_lang, code))
                current_lang = None
                current_code_lines = []
                start_line = 0
                end_line = 0
            elif in_code_block:
                # 其他语言的代码块，跳过
                pass
        elif in_code_block:
            # 在代码块内，收集代码行
            current_code_lines.append(line)

    return scripts


def run_script(code: str, dry_run: bool = False) -> Tuple[int, str, str]:
    """执行 bash 代码块，返回执行结果。"""
    if not code or not code.strip():
        return 1, "", "错误: 脚本代码为空"

    if dry_run:
        print("[DRY RUN] 执行脚本:")
        print(code)
        print("-" * 40)
        return 0, "", ""

    try:
        result = subprocess.run(
            ["bash", "-c", code],
            capture_output=True,
            text=True,
            shell=False,
        )
        return result.returncode, result.stdout, result.stderr
    except Exception as e:
        print(f"执行脚本时发生错误: {e}")
        return 1, "", str(e)

def print_script_list(scripts: List[Tuple[int, int, str, str]]):
    """列出所有 bash 脚本的详细信息。"""
    total = len(scripts)
    print(f"找到 {total} 个 bash 脚本:\n")

    for i, (start_line, end_line, lang, code) in enumerate(scripts, 1):
        print(f"{'='*60}")
        print(f"脚本 {i}/{total} (行号范围: {start_line}-{end_line}, 语言: {lang})")
        print(f"{'='*60}")
        print(f"代码:\n{code}")
        print(f"{'-'*60}\n")

def print_script_header(start_line: int, end_line: int, total: int, code: str, lang: str):
    """格式化输出脚本信息。"""
    print(f"\n{'='*60}")
    print(f"脚本 (行号范围: {start_line}-{end_line}, 总脚本数: {total}, 语言: {lang})")
    print(f"{'='*60}")
    print(f"代码:\n{code}")
    print(f"{'-'*60}")

def main():
    parser = argparse.ArgumentParser(
        description="解析 markdown 文件并执行指定行号对应的 bash 代码块。"
    )
    parser.add_argument(
        "file",
        help="markdown 文件路径"
    )
    parser.add_argument(
        "line_number",
        type=int,
        nargs='?',
        help="要执行的代码块所在行号（可以是脚本范围内的任意行号）。当使用 --list 时此参数可选。"
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="列出所有 bash 脚本及其详细信息，不执行"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="只打印脚本而不执行"
    )

    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"错误: 文件不存在 {file_path}")
        sys.exit(1)

    try:
        content = file_path.read_text(encoding='utf-8')
    except Exception as e:
        print(f"读取文件失败: {e}")
        sys.exit(1)

    # 提取脚本
    try:
        scripts = extract_bash_scripts(content)
    except Exception as e:
        print(f"解析 markdown 时发生错误: {e}")
        sys.exit(1)

    if not scripts:
        print("未找到 bash 脚本。")
        print("支持的代码块格式: ```bash, ```sh, ```shell, ```zsh")
        sys.exit(0)

    # 如果指定了 --list，列出所有脚本并退出
    if args.list:
        print_script_list(scripts)
        sys.exit(0)

    # 检查是否提供了行号
    if args.line_number is None:
        print("错误: 需要指定行号或使用 --list 选项。")
        print("使用 --list 查看所有可用脚本。")
        sys.exit(1)

    # 查找包含指定行号的脚本
    found_script = None
    for start_line, end_line, lang, code in scripts:
        if start_line <= args.line_number <= end_line:
            found_script = (start_line, end_line, lang, code)
            break

    if not found_script:
        print(f"错误: 行号 {args.line_number} 不在任何 bash 脚本范围内。")
        if scripts:
            print("可用的脚本行号范围:")
            for i, (start, end, lang, _) in enumerate(scripts, 1):
                print(f"  脚本 {i}: 行号 {start}-{end} (语言: {lang})")
        sys.exit(1)

    start_line, end_line, lang, code = found_script
    print_script_header(start_line, end_line, len(scripts), code, lang)

    returncode, stdout, stderr = run_script(code, args.dry_run)

    if not args.dry_run:
        if stdout:
            print("标准输出:")
            print(stdout)
        if stderr:
            print("标准错误:")
            print(stderr)
        print(f"返回码: {returncode}")

        if returncode != 0:
            print("脚本执行失败!")
            sys.exit(1)

if __name__ == "__main__":
    main()