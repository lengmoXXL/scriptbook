#!/usr/bin/env python3
"""
File API handler for serving markdown files.
"""

import json
import logging
import tornado.web

from backend.sandbox.manager import get_sandbox_manager
from backend.utils.file_system import list_markdown_files, read_file_content

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
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')

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


class SandboxFileHandler(tornado.web.RequestHandler):
    """
    Handler for sandbox file operations.

    Routes:
        GET /api/sandbox/{sandbox_id}/files - list markdown files in workspace
        GET /api/sandbox/{sandbox_id}/files/{filename} - get file content from workspace
    """

    def set_default_headers(self):
        """Set CORS headers to allow frontend development server access."""
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "*")
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')

    def options(self, sandbox_id: str = "", filename: str = ""):
        """Handle OPTIONS request for CORS preflight."""
        self.set_status(204)
        self.finish()

    async def get(self, sandbox_id: str, filename: str = ""):
        """
        Handle GET requests.

        Args:
            sandbox_id: Sandbox ID
            filename: Optional filename parameter from URL pattern
        Query params:
            doc_path: Optional path to use instead of default /workspace
        """
        try:
            doc_path = self.get_query_argument("doc_path", default="/workspace")
            sandbox = await get_sandbox_manager().get_sandbox_handle(sandbox_id)

            if not filename:
                files = await self._list_markdown_files(sandbox, doc_path)
                self.write(json.dumps(files))
                self.set_header("Content-Type", "application/json")
            else:
                content = await self._read_file_content(sandbox, doc_path, filename)
                self.write(content)
                self.set_header("Content-Type", "text/plain; charset=utf-8")
        except Exception as e:
            self._handle_error(e)

    async def _list_markdown_files(self, sandbox, doc_path: str):
        """List markdown files in sandbox workspace directory."""
        result = await sandbox.execute_command(f"find {doc_path} -maxdepth 1 -name '*.md' -type f -exec basename {{}} \\; | sort")
        if result.exit_code != 0:
            return []
        files = []
        for line in result.output.strip().split('\n'):
            if line:
                files.append(line)
        return files

    async def _read_file_content(self, sandbox, doc_path: str, filename: str):
        """Read file content from sandbox workspace directory."""
        if '..' in filename or filename.startswith('/'):
            raise ValueError("Invalid filename")
        result = await sandbox.execute_command(f"cat {doc_path}/{filename}")
        if result.exit_code != 0:
            raise FileNotFoundError(f"File not found: {filename}")
        return result.output

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

        error_message = str(error) or "Unknown error occurred"
        self.write({"error": error_message})
        self.set_header("Content-Type", "application/json")