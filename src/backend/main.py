#!/usr/bin/env python3
"""
Terminal WebSocket server using Tornado and Terminado.
Provides PTY terminals to web clients with session persistence.
"""

import logging

import tornado.ioloop
import tornado.web
from terminado.management import NamedTermManager
from terminado.websocket import TermSocket


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


def make_app():
    """Create Tornado application."""
    term_manager = NamedTermManager(shell_command=['bash'])

    return tornado.web.Application([
        (r'/ws/(.*)', TerminalWebSocketHandler, {'term_manager': term_manager}),
        (r'/health', HealthCheckHandler),
    ])


def main():
    """Start the server."""
    app = make_app()
    app.listen(8080)

    logger.info("Terminal WebSocket server started on port 8080")
    logger.info("WebSocket endpoint: ws://localhost:8080/ws or ws://localhost:8080/ws/{term_name}")
    logger.info("Health check: http://localhost:8080/health")

    tornado.ioloop.IOLoop.current().start()


if __name__ == '__main__':
    main()
