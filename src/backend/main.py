#!/usr/bin/env python3
"""
ScriptBook - Terminal WebSocket server with document browsing.

Commands:
    server   - Start the ScriptBook server
    control  - Send control commands to frontend
"""

import argparse
import functools
import json
import logging
import os
import sys
import urllib.request
import urllib.error

import tornado.ioloop
import tornado.web
from terminado.management import NamedTermManager, PtyWithClients, MaxTerminalsReached
from terminado.websocket import TermSocket
from backend.handlers.file_handler import FileHandler
from backend.handlers.control_handler import ControlWebSocketHandler, ControlApiHandler


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class SandboxTermManager(NamedTermManager):
    """TermManager that can connect to docker containers or read .tl config files.

    URL format:
    - /ws/{container_id} -> connect to docker container directly
    - /ws/{config_file}.tl -> read config file and execute shell_command
    """

    def __init__(self, shell_command=None, docs_dir=None, connection_id=None):
        super().__init__(shell_command=shell_command)
        self.docs_dir = docs_dir
        self.connection_id = connection_id

    def get_terminal(self, term_name: str, connection_id: str = None):
        """Get or create a terminal by name.

        term_name format: {config_name}/{tab_id}
        - config_name: .tl file or container_id
        - tab_id: unique identifier for each terminal tab
        """
        assert term_name is not None
        logger.info(f"get_terminal called with term_name: {term_name}")

        # Return existing terminal if already created
        if term_name in self.terminals:
            logger.info(f"Returning existing terminal for: {term_name}")
            return self.terminals[term_name]

        # Check max terminals limit
        if self.max_terminals and len(self.terminals) >= self.max_terminals:
            raise MaxTerminalsReached(self.max_terminals)

        # Parse config name from term_name (strip tab_id)
        config_name = term_name.rsplit('/', 1)[0]

        # Check if it's a tl config file
        if config_name.endswith('.tl'):
            # builtin.tl is a built-in terminal, always uses bash
            if config_name == 'builtin.tl':
                shell_cmd = ['bash']
                logger.info(f"Terminal will use built-in default shell: bash")
            else:
                # Read config file to get shell_command
                config_path = os.path.join(self.docs_dir, config_name)
                try:
                    with open(config_path, 'r') as f:
                        config_content = f.read()
                    # Parse simple key=value format
                    shell_command = ''
                    for line in config_content.split('\n'):
                        line = line.strip()
                        if '=' in line and not line.startswith('#'):
                            key, value = line.split('=', 1)
                            if key.strip() == 'shell_command':
                                shell_command = value.strip().strip('"\'"')
                                break

                    if not shell_command:
                        shell_command = 'bash'

                    shell_cmd = ['bash', '-c', shell_command]
                    logger.info(f"Terminal will execute shell_command from {config_name}: {shell_command}")
                except FileNotFoundError:
                    raise FileNotFoundError(f"Config file not found: {config_path}")
                except Exception as e:
                    raise RuntimeError(f"Error reading config {config_name}: {e}")
        else:
            # Direct container connection
            container_id = config_name
            shell_cmd = ['bash', '-c', f'docker exec -it {container_id} bash']
            logger.info(f"Terminal will connect to container: {container_id}")

        # Create terminal
        options = self.term_settings.copy()
        options["shell_command"] = shell_cmd
        env = self.make_term_env(**options)
        # Add connection ID to environment if provided
        if connection_id:
            env['SCRIPTBOOK_CONNECTION_ID'] = connection_id
        cwd = options.get("cwd", None)

        self.log.info("New terminal with specified name: %s", term_name)
        term = PtyWithClients(shell_cmd, env, cwd)
        term.term_name = term_name
        self.terminals[term_name] = term
        self.start_reading(term)
        return term


class TerminalWebSocketHandler(TermSocket):
    """WebSocket handler with CORS support and error handling."""

    def check_origin(self, _origin):
        return True

    def open(self, url_component=None):
        """Open terminal connection with proper error handling."""
        try:
            # Get connection_id from query parameter
            connection_id = self.get_argument('cid', None)
            self.connection_id = connection_id

            # Use partial to bind connection_id to get_terminal
            if connection_id:
                # Save reference to the bound method
                original_method = self.term_manager.__class__.get_terminal.__get__(self.term_manager)
                self.term_manager.get_terminal = functools.partial(
                    original_method,
                    connection_id=connection_id
                )

            super().open(url_component)
        except FileNotFoundError as e:
            self.close(code=1002, reason=str(e))
        except Exception as e:
            self.close(code=1011, reason=str(e))


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
    term_manager = SandboxTermManager(shell_command=['bash'], docs_dir=docs_dir)

    handlers = [
        (r'/ws/control', ControlWebSocketHandler),
        (r'/api/control', ControlApiHandler),
        (r'/ws/(.*)', TerminalWebSocketHandler, {'term_manager': term_manager}),
        (r'/health', HealthCheckHandler),
        (r'/api/files', FileHandler, {'docs_dir': docs_dir}),
        (r'/api/files/(.*)', FileHandler, {'docs_dir': docs_dir}),
    ]

    handlers.append((r'/(.*)', SPAStaticFileHandler, {
        'path': static_dir,
        'default_filename': 'index.html'
    }))
    logger.info(f"Static file serving from: {static_dir}")
    return tornado.web.Application(handlers)


def parse_args():
    """Parse command line arguments."""
    parser = argparse.ArgumentParser(description='ScriptBook - Terminal WebSocket server')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')

    # server command
    server_parser = subparsers.add_parser('server', help='Start the ScriptBook server')
    server_parser.add_argument('content', nargs='?', default='.', help='Content directory (default: current directory)')
    server_parser.add_argument('--host', default='localhost', help='Host to bind to')
    server_parser.add_argument('--port', '-p', type=int, default=8080, help='Server port')

    # control command
    control_parser = subparsers.add_parser('control', help='Send control commands to frontend')
    control_parser.add_argument('action', choices=['open_window', 'split_window', 'close_window', 'focus_window'],
                                help='Control action')
    control_parser.add_argument('-c', '--connection-id', help='Connection ID (default: SCRIPTBOOK_CONNECTION_ID env)')
    control_parser.add_argument('--host', default='localhost', help='Server host')
    control_parser.add_argument('--port', '-p', type=int, default=8080, help='Server port')
    control_parser.add_argument('-f', '--filename', help='Filename for open_window')
    control_parser.add_argument('-t', '--type', choices=['markdown', 'terminal'], help='Window type')
    control_parser.add_argument('-d', '--direction', choices=['horizontal', 'vertical'], help='Split direction')
    control_parser.add_argument('-w', '--window-id', help='Window ID')

    return parser.parse_args()


def cmd_control(args):
    """Send control command to frontend."""
    connection_id = args.connection_id or os.environ.get('SCRIPTBOOK_CONNECTION_ID')
    if not connection_id:
        print("Error: connection_id required. Set SCRIPTBOOK_CONNECTION_ID or use -c", file=sys.stderr)
        sys.exit(1)

    payload = {}
    if args.filename:
        payload['filename'] = args.filename
    if args.type:
        payload['type'] = args.type
    if args.direction:
        payload['direction'] = args.direction
    if args.window_id:
        payload['windowId'] = args.window_id

    data = {
        'connection_id': connection_id,
        'action': args.action,
        'payload': payload
    }

    url = f"http://{args.host}:{args.port}/api/control"
    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            result = json.loads(response.read().decode('utf-8'))
            if result.get('status') == 'ok':
                print(f"Command '{args.action}' sent")
            else:
                print(f"Error: {result.get('error', 'Unknown')}", file=sys.stderr)
                sys.exit(1)
    except urllib.error.HTTPError as e:
        error = json.loads(e.read().decode('utf-8'))
        print(f"Error: {error.get('error', e)}", file=sys.stderr)
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"Error: Cannot connect to {url}: {e.reason}", file=sys.stderr)
        sys.exit(1)


def cmd_server(args):
    """Start the ScriptBook server."""
    # Enable autoreload in development mode
    if os.environ.get('DEV_MODE', 'false').lower() == 'true':
        import tornado.autoreload as tornado_autoreload
        tornado_autoreload.start()
        logger.info("Autoreload enabled - server will restart when Python files change")

    # Convert to absolute path
    content = os.path.abspath(args.content)

    if not os.path.exists(content):
        raise FileNotFoundError(f"Directory does not exist: {content}")

    if not os.path.isdir(content):
        raise NotADirectoryError(f"Path is not a directory: {content}")

    # Determine static directory
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    static_dir = os.path.join(backend_dir, 'static')
    static_dir = os.path.normpath(static_dir)

    if not os.path.exists(static_dir):
        raise FileNotFoundError(f"Static directory does not exist: {static_dir}")

    if not os.path.isdir(static_dir):
        raise NotADirectoryError(f"Static path is not a directory: {static_dir}")

    app = make_app(content, static_dir)
    app.listen(args.port, args.host)

    logger.info(f"ScriptBook server started on {args.host}:{args.port}")
    logger.info(f"Document directory: {content}")
    logger.info(f"Frontend: http://{args.host}:{args.port}/")

    tornado.ioloop.IOLoop.current().start()


def main():
    """Entry point."""
    args = parse_args()

    if args.command == 'server':
        cmd_server(args)
    elif args.command == 'control':
        cmd_control(args)
    else:
        # Default: show help
        print("Usage: python -m src.backend.main <server|control> [options]")
        sys.exit(1)


if __name__ == '__main__':
    main()
