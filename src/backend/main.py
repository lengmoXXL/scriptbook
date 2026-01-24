#!/usr/bin/env python3
"""
Terminal WebSocket server using Tornado and Terminado.
Provides PTY terminals to web clients with session persistence.
"""

import argparse
import logging
import os

import tornado.ioloop
import tornado.web
from terminado.management import NamedTermManager
from terminado.websocket import TermSocket
from handlers.file_handler import FileHandler


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TerminalWebSocketHandler(TermSocket):
    """WebSocket handler with session persistence support."""

    def check_origin(self, origin):
        return True


class HealthCheckHandler(tornado.web.RequestHandler):
    """Health check endpoint."""

    def get(self):
        self.write({'status': 'ok', 'service': 'terminal-ws'})


def make_app(docs_dir):
    """Create Tornado application."""
    term_manager = NamedTermManager(shell_command=['bash'])

    return tornado.web.Application([
        (r'/ws/(.*)', TerminalWebSocketHandler, {'term_manager': term_manager}),
        (r'/health', HealthCheckHandler),
        (r'/api/files', FileHandler, {'docs_dir': docs_dir}),
        (r'/api/files/(.*)', FileHandler, {'docs_dir': docs_dir}),
    ])


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='ScriptBook server with terminal and document browsing')
    parser.add_argument('--docs-dir', '-d',
                       default=os.getcwd(),
                       help='Directory containing markdown documents (default: current working directory)')
    parser.add_argument('--port', '-p',
                       type=int,
                       default=8080,
                       help='Server port (default: 8080)')
    return parser.parse_args()


def main():
    """Start the server."""
    args = parse_args()

    # Convert to absolute path
    docs_dir = os.path.abspath(args.docs_dir)

    if not os.path.exists(docs_dir):
        logger.error(f"Directory does not exist: {docs_dir}")
        return

    if not os.path.isdir(docs_dir):
        logger.error(f"Path is not a directory: {docs_dir}")
        return

    app = make_app(docs_dir)
    app.listen(args.port)

    logger.info(f"ScriptBook server started on port {args.port}")
    logger.info(f"Document directory: {docs_dir}")
    logger.info(f"WebSocket endpoint: ws://localhost:{args.port}/ws or ws://localhost:{args.port}/ws/{{term_name}}")
    logger.info(f"Health check: http://localhost:{args.port}/health")
    logger.info(f"File API: http://localhost:{args.port}/api/files")

    tornado.ioloop.IOLoop.current().start()


if __name__ == '__main__':
    main()
