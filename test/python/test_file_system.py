#!/usr/bin/env python3
"""
Test file system utilities using pytest.
"""
import os
import tempfile
import pytest

from backend.utils.file_system import list_markdown_files, read_file_content, is_safe_path


def test_is_safe_path():
    """Test path safety checking."""
    base = "/tmp/test"

    # Safe paths
    assert is_safe_path(base, "file.md") == True
    assert is_safe_path(base, "subdir/file.md") == True
    assert is_safe_path(base, "../file.md") == False  # Outside base
    assert is_safe_path(base, "/etc/passwd") == False  # Absolute path outside


def test_list_markdown_files():
    """Test listing markdown files."""
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create test files
        open(os.path.join(tmpdir, "test1.md"), "w").close()
        open(os.path.join(tmpdir, "test2.md"), "w").close()
        open(os.path.join(tmpdir, "test3.txt"), "w").close()  # Should be ignored
        os.mkdir(os.path.join(tmpdir, "subdir"))  # Directory should be ignored

        files = list_markdown_files(tmpdir)
        assert set(files) == {"test1.md", "test2.md"}
        assert "test3.txt" not in files

        # Should be sorted
        assert files == ["test1.md", "test2.md"]

        # Test empty directory
        empty_dir = os.path.join(tmpdir, "empty")
        os.mkdir(empty_dir)
        assert list_markdown_files(empty_dir) == []


def test_read_file_content():
    """Test reading file content."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.md")
        content = "# Hello World\n\nThis is a test."

        with open(test_file, "w", encoding="utf-8") as f:
            f.write(content)

        # Read file
        read_content = read_file_content(tmpdir, "test.md")
        assert read_content == content

        # Test with non-existent file
        with pytest.raises(FileNotFoundError):
            read_file_content(tmpdir, "nonexistent.md")


def test_read_file_content_encoding():
    """Test reading file with UTF-8 encoding requirement."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "test.md")

        # Create a file with UTF-8 encoding (should work)
        content = "# UTF-8 Test\n\n中文测试"
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(content)

        read_content = read_file_content(tmpdir, "test.md")
        assert read_content == content


def test_read_file_content_size_limit():
    """Test file size limit enforcement."""
    with tempfile.TemporaryDirectory() as tmpdir:
        test_file = os.path.join(tmpdir, "large.md")

        # Create a file larger than default limit (1MB)
        large_content = "x" * 2_000_000  # 2MB
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(large_content)

        # Should raise IOError for file too large
        with pytest.raises(IOError, match="File too large"):
            read_file_content(tmpdir, "large.md")


@pytest.mark.slow
def test_project_files():
    """Test with actual project files (marked as slow)."""
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    # List files in project root
    files = list_markdown_files(project_root)

    # Just verify the function runs without error
    assert isinstance(files, list)

    # If there are markdown files, try to read one
    if files and "README.md" in files:
        content = read_file_content(project_root, "README.md")
        assert isinstance(content, str)