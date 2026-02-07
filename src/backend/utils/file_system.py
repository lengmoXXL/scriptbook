#!/usr/bin/env python3
"""
File system utilities for safe directory scanning and file reading.
"""

import os
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


def is_safe_path(base_dir: str, requested_path: str) -> bool:
    """
    Check if requested_path is within base_dir to prevent directory traversal attacks.

    Args:
        base_dir: The base directory that should contain all accessible files
        requested_path: The requested file path (relative or absolute)

    Returns:
        True if the path is safe, False otherwise
    """
    try:
        # Resolve both paths to absolute paths
        base_abs = os.path.abspath(base_dir)
        requested_abs = os.path.abspath(os.path.join(base_dir, requested_path))

        # Check if the resolved path starts with the base directory
        return requested_abs.startswith(base_abs)
    except Exception as e:
        logger.error(f"Error checking path safety: {e}")
        return False


def list_markdown_files(directory: str) -> List[str]:
    """
    List all .sandbox files in the given directory (non-recursive).

    Args:
        directory: Directory to scan

    Returns:
        List of sandbox config filenames (just names, not full paths)

    Raises:
        FileNotFoundError: If directory does not exist
        NotADirectoryError: If path is not a directory
    """
    if not os.path.exists(directory):
        raise FileNotFoundError(f"Directory does not exist: {directory}")

    if not os.path.isdir(directory):
        raise NotADirectoryError(f"Path is not a directory: {directory}")

    files = []
    try:
        for item in os.listdir(directory):
            item_path = os.path.join(directory, item)
            # Check if it's a file (not a directory) and ends with .sandbox
            if os.path.isfile(item_path):
                item_lower = item.lower()
                if item_lower.endswith('.sandbox'):
                    files.append(item)
    except PermissionError as e:
        logger.error(f"Permission denied accessing directory {directory}: {e}")
        raise
    except Exception as e:
        logger.error(f"Error listing files in {directory}: {e}")
        raise

    # Sort alphabetically for consistent ordering
    files.sort()
    return files


def read_file_content(base_dir: str, filename: str, max_size: int = 1024 * 1024) -> str:
    """
    Read content of a file safely.

    Args:
        base_dir: Base directory for file access
        filename: Name of the file to read (must be within base_dir)
        max_size: Maximum file size to read in bytes (default: 1MB)

    Returns:
        File content as string

    Raises:
        ValueError: If path is not safe
        FileNotFoundError: If file does not exist
        IOError: If file cannot be read
    """
    # Security check
    if not is_safe_path(base_dir, filename):
        raise ValueError(f"Access denied: {filename} is outside of allowed directory")

    file_path = os.path.join(base_dir, filename)

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File does not exist: {filename}")

    if not os.path.isfile(file_path):
        raise ValueError(f"Path is not a file: {filename}")

    # Check file size
    file_size = os.path.getsize(file_path)
    if file_size > max_size:
        raise IOError(f"File too large: {file_size} bytes (max: {max_size} bytes)")

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError as e:
        logger.error(f"File {filename} is not UTF-8 encoded: {e}")
        raise IOError(f"File {filename} must be UTF-8 encoded")
    except Exception as e:
        logger.error(f"Error reading file {filename}: {e}")
        raise IOError(f"Cannot read file {filename}: {e}")