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
from terminado.management import NamedTermManager, PtyWithClients, MaxTerminalsReached
from terminado.websocket import TermSocket
from backend.handlers.file_handler import FileHandler, SandboxFileHandler
from backend.handlers.sandbox_handler import SandboxHandler
from backend.handlers.sandbox_ws_handler import SandboxWebSocketHandler


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SandboxTermManager(NamedTermManager):
    """TermManager that can connect to docker containers by container_id.

    URL format:
    - /ws/{container_id} -> connect to docker container
    """

    def get_terminal(self, term_name: str):
        """Get or create a terminal by name.

        term_name is treated as container_id for docker exec connection.
        """
        assert term_name is not None

        # Return existing terminal if already created
        if term_name in self.terminals:
            return self.terminals[term_name]

        # Check max terminals limit
        if self.max_terminals and len(self.terminals) >= self.max_terminals:
            raise MaxTerminalsReached(self.max_terminals)

        # Use term_name as container_id directly
        container_id = term_name

        shell_cmd = ['bash', '-c', f'docker exec -it {container_id} bash']
        logger.info(f"Terminal will connect to container: {container_id}")

        # Create terminal
        options = self.term_settings.copy()
        options["shell_command"] = shell_cmd
        env = self.make_term_env(**options)
        cwd = options.get("cwd", None)

        self.log.info("New terminal with specified name: %s", term_name)
        term = PtyWithClients(shell_cmd, env, cwd)
        term.term_name = term_name
        self.terminals[term_name] = term
        self.start_reading(term)
        return term


class TerminalWebSocketHandler(TermSocket):
    """WebSocket handler with session persistence support."""

    def check_origin(self, _origin):
        return True


class HealthCheckHandler(tornado.web.RequestHandler):
    """Health check endpoint."""

    def get(self):
        self.write({'status': 'ok', 'service': 'terminal-ws'})


class CORSStaticFileHandler(tornado.web.StaticFileHandler):
    """Static file handler with CORS support."""

    def set_default_headers(self):
        """Set CORS headers to allow frontend development server access."""
        self.set_header("Access-Control-Allow-Origin", "*")
        self.set_header("Access-Control-Allow-Headers", "x-requested-with")
        self.set_header('Access-Control-Allow-Methods', 'GET, OPTIONS')




class SPAStaticFileHandler(CORSStaticFileHandler):
    """Single Page Application static file handler.

    Serves static files if they exist, otherwise falls back to index.html
    for client-side routing.
    """

    def validate_absolute_path(self, root, absolute_path):
        """Override to serve index.html when file doesn't exist."""
        try:
            return super().validate_absolute_path(root, absolute_path)
        except tornado.web.HTTPError as e:
            if e.status_code == 404:
                # File not found, serve index.html instead
                index_path = os.path.join(root, 'index.html')
                if os.path.exists(index_path):
                    return index_path
            raise


def make_app(docs_dir, static_dir):
    """Create Tornado application."""
    term_manager = SandboxTermManager(shell_command=['bash'])

    handlers = [
        (r'/ws/sandbox/(?P<sandbox_id>[^/]+)', SandboxWebSocketHandler),
        (r'/ws/(.*)', TerminalWebSocketHandler, {'term_manager': term_manager}),
        (r'/health', HealthCheckHandler),
        (r'/api/files', FileHandler, {'docs_dir': docs_dir}),
        (r'/api/files/(.*)', FileHandler, {'docs_dir': docs_dir}),
        (r'/api/sandbox/(?P<sandbox_id>[^/]+)/files', SandboxFileHandler),
        (r'/api/sandbox/(?P<sandbox_id>[^/]+)/files/(?P<filename>.*)', SandboxFileHandler),
        (r'/api/sandbox/(?P<sandbox_id>[^/]+)/command', SandboxHandler),
        (r'/api/sandbox', SandboxHandler),
        (r'/api/sandbox/(?P<sandbox_id>[^/]+)', SandboxHandler),
    ]

    handlers.append((r'/(.*)', SPAStaticFileHandler, {
        'path': static_dir,
        'default_filename': 'index.html'
    }))
    logger.info(f"Static file serving from: {static_dir}")
    return tornado.web.Application(handlers)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='ScriptBook server with terminal and document browsing')
    parser.add_argument('content',
                       type=str,
                       default=os.getcwd(),
                       help='Directory containing markdown documents (default: current working directory)')
    parser.add_argument('--host',
                       default='localhost',
                       help='Host to bind to (default: localhost)')
    parser.add_argument('--port', '-p',
                       type=int,
                       default=8080,
                       help='Server port (default: 8080)')
    return parser.parse_args()


def main():
    """Start the server."""
    args = parse_args()

    # Enable autoreload in development mode
    if os.environ.get('DEV_MODE', 'false').lower() == 'true':
        import tornado.autoreload as tornado_autoreload
        tornado_autoreload.start()
        logger.info("Autoreload enabled - server will restart when Python files change")

    # Convert to absolute path
    content = os.path.abspath(args.content)

    if not os.path.exists(content):
        logger.error(f"Directory does not exist: {content}")
        return

    if not os.path.isdir(content):
        logger.error(f"Path is not a directory: {content}")
        return

    # Determine static directory (default: package internal static directory)
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(backend_dir, 'static')
    static_dir = os.path.normpath(static_dir)

    # Check static directory
    if not os.path.exists(static_dir):
        logger.warning(f"Static directory does not exist: {static_dir}")
        logger.warning("Frontend static files will not be served.")
        static_dir = None
    elif not os.path.isdir(static_dir):
        logger.error(f"Static path is not a directory: {static_dir}")
        return

    app = make_app(content, static_dir)
    app.listen(args.port, args.host)

    logger.info(f"ScriptBook server started on {args.host}:{args.port}")
    logger.info(f"Document directory: {content}")
    if static_dir:
        logger.info(f"Static file directory: {static_dir}")
        logger.info(f"Frontend: http://{args.host}:{args.port}/")
    else:
        logger.warning("Static file serving disabled")
    logger.info(f"WebSocket endpoint: ws://{args.host}:{args.port}/ws or ws://{args.host}:{args.port}/ws/{{term_name}}")
    logger.info(f"Health check: http://{args.host}:{args.port}/health")
    logger.info(f"File API: http://{args.host}:{args.port}/api/files")

    tornado.ioloop.IOLoop.current().start()


if __name__ == '__main__':
    main()
