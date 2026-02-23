#!/usr/bin/env python3
"""
File API handler for serving markdown files.
"""

import json
import logging
import tornado.web

from backend.utils.file_system import list_markdown_files, read_file_content, write_file_content

logger = logging.getLogger(__name__)


class FileHandler(tornado.web.RequestHandler):
    """
    Handler for file operations.

    Routes:
        GET /api/files - list markdown files
        GET /api/files/{filename} - get file content
    """

    def initialize(self, docs_dir: str):
        """
        Initialize handler with docs directory.

        Args:
            docs_dir: Base directory for markdown files
        """
        self.docs_dir = docs_dir

    def set_default_headers(self):
        """Set CORS headers to allow frontend development server access."""
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with, Content-Type")
        self.set_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')

    def options(self, *args):
        """Handle OPTIONS request for CORS preflight."""
        self.set_status(204)
        self.finish()

    def get(self, filename: str = None):
        """
        Handle GET requests.

        Args:
            filename: Optional filename parameter from URL pattern
        """
        try:
            if filename is None:
                files = list_markdown_files(self.docs_dir)
                self.write(json.dumps(files))
                self.set_header("Content-Type", "application/json")
            else:
                content = read_file_content(self.docs_dir, filename)
                self.write(content)
                self.set_header("Content-Type", "text/plain; charset=utf-8")
        except Exception as e:
            self._handle_error(e)

    def post(self, filename: str = None):
        """
        Handle POST requests - save a file.

        Args:
            filename: Filename to save (required)
        """
        if filename is None:
            self.set_status(400)
            self.write({"error": "Filename required"})
            self.set_header("Content-Type", "application/json")
            return

        try:
            content = self.request.body.decode('utf-8')
            write_file_content(self.docs_dir, filename, content)
            self.write({"status": "ok"})
            self.set_header("Content-Type", "application/json")
        except Exception as e:
            self._handle_error(e)

    def _handle_error(self, error: Exception):
        """Unified error handler for all exceptions."""
        logger.error(f"Request error: {error}")

        if isinstance(error, FileNotFoundError):
            self.set_status(404)
        elif isinstance(error, (PermissionError, ValueError)):
            self.set_status(403)
        elif isinstance(error, (NotADirectoryError, IOError)):
            self.set_status(400)
        else:
            self.set_status(500)

        # 确保错误信息不为空
        error_message = str(error) or "Unknown error occurred"
        self.write({"error": error_message})
        self.set_header("Content-Type", "application/json")