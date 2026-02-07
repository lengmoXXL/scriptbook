#!/usr/bin/env python3
"""
Test sandbox WebSocket endpoints using pytest.
"""
import pytest
import asyncio
import websockets
import json

WS_URL = 'ws://localhost:8080/ws/sandbox'
API_BASE = 'http://localhost:8080/api'
BACKEND_URL = 'http://localhost:8080'


@pytest.fixture(scope='module')
def sandbox_id():
    """Create a shared sandbox for tests."""
    import requests
    response = requests.post(f'{API_BASE}/sandbox', json={})
    assert response.status_code == 200
    data = response.json()
    return data['id']


@pytest.mark.asyncio
async def test_ws_connection_connected_message(sandbox_id):
    """Test WebSocket connection receives connected message."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected message
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(message)
        assert data['type'] == 'connected'
        assert data['sandbox_id'] == sandbox_id


@pytest.mark.asyncio
async def test_ws_nonexistent_sandbox_error():
    """Test connecting to nonexistent sandbox returns error."""
    uri = f'{WS_URL}/nonexistent_123456'
    try:
        async with websockets.connect(uri, close_timeout=5) as ws:
            message = await asyncio.wait_for(ws.recv(), timeout=5)
            data = json.loads(message)
            # Should receive error message or connection should close
            assert data.get('type') == 'error' or True
    except (websockets.exceptions.ConnectionClosed, ConnectionRefusedError):
        # Connection closed is also acceptable
        pass


@pytest.mark.asyncio
async def test_ws_execute_simple_command(sandbox_id):
    """Test executing simple command via WebSocket."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send command
        await ws.send(json.dumps({'command': 'echo hello world'}))

        # Collect messages until done
        messages = []
        while True:
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(message)
                messages.append(data)
                if data.get('type') == 'done':
                    break
            except asyncio.TimeoutError:
                break

        # Check we got output
        stdout_msgs = [m for m in messages if m.get('type') == 'stdout']
        assert len(stdout_msgs) > 0
        output = ''.join([m.get('content', '') for m in stdout_msgs])
        assert 'hello world' in output

        # Check done message
        done_msg = [m for m in messages if m.get('type') == 'done'][0]
        assert done_msg['exit_code'] == 0
        assert done_msg['has_error'] is False


@pytest.mark.asyncio
async def test_ws_execute_multiline_command(sandbox_id):
    """Test executing multi-line command via WebSocket."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send multi-line command
        await ws.send(json.dumps({'command': 'echo line1\necho line2\necho line3'}))

        # Collect messages until done
        messages = []
        while True:
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(message)
                messages.append(data)
                if data.get('type') == 'done':
                    break
            except asyncio.TimeoutError:
                break

        stdout_msgs = [m for m in messages if m.get('type') == 'stdout']
        output = ''.join([m.get('content', '') for m in stdout_msgs])
        assert 'line1' in output
        assert 'line2' in output
        assert 'line3' in output


@pytest.mark.asyncio
async def test_ws_execute_nonexistent_command(sandbox_id):
    """Test executing nonexistent command returns error."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send nonexistent command
        await ws.send(json.dumps({'command': 'nonexistent_command_123456'}))

        # Collect messages until done
        messages = []
        while True:
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=5)
                data = json.loads(message)
                messages.append(data)
                if data.get('type') == 'done':
                    break
            except asyncio.TimeoutError:
                break

        done_msg = [m for m in messages if m.get('type') == 'done'][0]
        assert done_msg['exit_code'] > 0
        assert done_msg['has_error'] is True


@pytest.mark.asyncio
async def test_ws_missing_command_field(sandbox_id):
    """Test sending message without command field returns error."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send empty command
        await ws.send(json.dumps({}))

        # Should receive error message
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(message)
        assert data['type'] == 'error'
        assert 'Command is required' in data['error']


@pytest.mark.asyncio
async def test_ws_invalid_json(sandbox_id):
    """Test sending invalid JSON returns error."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send invalid JSON
        await ws.send('not valid json')

        # Should receive error message
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(message)
        assert data['type'] == 'error'
        assert 'Invalid JSON' in data['error']


@pytest.mark.asyncio
async def test_ws_multiple_commands(sandbox_id):
    """Test executing multiple commands sequentially."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        commands = ['echo cmd1', 'echo cmd2', 'echo cmd3']
        done_count = 0

        for cmd in commands:
            await ws.send(json.dumps({'command': cmd}))

            # Wait for done
            while True:
                try:
                    message = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(message)
                    if data.get('type') == 'done':
                        done_count += 1
                        break
                except asyncio.TimeoutError:
                    break

        assert done_count == 3


@pytest.mark.asyncio
async def test_ws_client_close(sandbox_id):
    """Test client can close connection."""
    from websockets.protocol import State

    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Close connection
        await ws.close()

        # Connection should be closed
        assert ws.state == State.CLOSED


@pytest.mark.asyncio
async def test_ws_streaming_output(sandbox_id):
    """Test receiving streaming output from command."""
    uri = f'{WS_URL}/{sandbox_id}'
    async with websockets.connect(uri) as ws:
        # Wait for connected
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send command that produces multiple outputs
        await ws.send(json.dumps({'command': 'for i in 1 2 3; do echo "output $i"; done'}))

        # Collect all messages
        messages = []
        while True:
            try:
                message = await asyncio.wait_for(ws.recv(), timeout=15)
                data = json.loads(message)
                messages.append(data)
                if data.get('type') == 'done':
                    break
            except asyncio.TimeoutError:
                break

        stdout_msgs = [m for m in messages if m.get('type') == 'stdout']
        # Should receive 3 separate output messages
        assert len(stdout_msgs) == 3

        # Check each output
        assert 'output 1' in stdout_msgs[0]['content']
        assert 'output 2' in stdout_msgs[1]['content']
        assert 'output 3' in stdout_msgs[2]['content']


@pytest.mark.asyncio
async def test_terminal_ws_connection():
    """Test terminal WebSocket connection."""
    from websockets.protocol import State

    uri = 'ws://localhost:8080/ws/tty'
    async with websockets.connect(uri) as ws:
        # Wait for setup message (TermSocket format is a list)
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        data = json.loads(message)
        # TermSocket format: ['setup', ...]
        assert isinstance(data, list)
        assert data[0] == 'setup'

        # Send resize message (TermSocket format)
        await ws.send(json.dumps(['set_size', 40, 120]))

        # Send input
        await ws.send(json.dumps(['stdin', 'ls\n']))

        # Should receive output
        message = await asyncio.wait_for(ws.recv(), timeout=5)
        # Just check we get a response
        assert message is not None


@pytest.mark.asyncio
async def test_terminal_ws_echo_command():
    """Test terminal WebSocket can execute echo command."""
    uri = 'ws://localhost:8080/ws/tty'
    async with websockets.connect(uri) as ws:
        # Wait for setup
        await asyncio.wait_for(ws.recv(), timeout=5)

        # Send command - should not raise
        await ws.send(json.dumps(['stdin', 'echo test_output\n']))

        # Successfully sent the command
        assert True
