#!/usr/bin/env python3
"""
Test backend API endpoints using pytest.
"""
import pytest
import requests

BACKEND_URL = 'http://localhost:8080'
API_BASE = f'{BACKEND_URL}/api'


@pytest.fixture(scope='module')
def sandbox_id():
    """Create a shared sandbox for tests."""
    response = requests.post(f'{API_BASE}/sandbox', json={})
    assert response.status_code == 200
    data = response.json()
    return data['id']


def test_health_check():
    """Test health check endpoint returns ok status."""
    response = requests.get(f'{BACKEND_URL}/health')
    assert response.status_code == 200

    body = response.json()
    assert body['status'] == 'ok'
    assert body['service'] == 'terminal-ws'


def test_health_check_content_type():
    """Test health check returns JSON content type."""
    response = requests.get(f'{BACKEND_URL}/health')
    assert 'application/json' in response.headers['content-type']


def test_health_check_fast_response():
    """Test health check responds quickly."""
    import time
    start = time.time()
    requests.get(f'{BACKEND_URL}/health')
    duration = (time.time() - start) * 1000
    assert duration < 1000


def test_create_sandbox():
    """Test creating a sandbox returns ID and status."""
    response = requests.post(f'{API_BASE}/sandbox', json={})
    assert response.status_code == 200

    body = response.json()
    assert 'id' in body
    assert isinstance(body['id'], str)
    assert len(body['id']) > 0
    assert 'status' in body


def test_create_sandbox_unique_ids():
    """Test each sandbox creation returns unique ID."""
    response1 = requests.post(f'{API_BASE}/sandbox', json={})
    assert response1.status_code == 200
    id1 = response1.json()['id']

    response2 = requests.post(f'{API_BASE}/sandbox', json={})
    assert response2.status_code == 200
    id2 = response2.json()['id']

    assert id1 != id2


def test_create_sandbox_content_type():
    """Test sandbox creation returns JSON."""
    response = requests.post(f'{API_BASE}/sandbox', json={})
    assert 'application/json' in response.headers['content-type']


def test_list_sandboxes():
    """Test listing all sandboxes."""
    # Create a few sandboxes first
    response1 = requests.post(f'{API_BASE}/sandbox', json={})
    sb1 = response1.json()
    response2 = requests.post(f'{API_BASE}/sandbox', json={})
    sb2 = response2.json()

    response = requests.get(f'{API_BASE}/sandbox')
    assert response.status_code == 200

    body = response.json()
    assert isinstance(body, list)

    ids = [sb['id'] for sb in body]
    assert sb1['id'] in ids
    assert sb2['id'] in ids


def test_get_sandbox_info(sandbox_id):
    """Test getting sandbox details."""
    response = requests.get(f'{API_BASE}/sandbox/{sandbox_id}')
    assert response.status_code == 200

    body = response.json()
    assert body['id'] == sandbox_id
    assert 'status' in body


def test_get_sandbox_info_content_type(sandbox_id):
    """Test sandbox info returns JSON."""
    response = requests.get(f'{API_BASE}/sandbox/{sandbox_id}')
    assert 'application/json' in response.headers['content-type']


def test_get_nonexistent_sandbox():
    """Test getting nonexistent sandbox returns 404."""
    response = requests.get(f'{API_BASE}/sandbox/nonexistent_123456')
    assert response.status_code == 404

    body = response.json()
    assert 'error' in body


def test_execute_command_ls(sandbox_id):
    """Test executing ls command."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={'command': 'ls'}
    )
    assert response.status_code == 200

    body = response.json()
    assert 'output' in body
    assert 'error' in body
    assert 'exitCode' in body
    assert body['exitCode'] == 0


def test_execute_command_pwd(sandbox_id):
    """Test executing pwd command."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={'command': 'pwd'}
    )
    assert response.status_code == 200

    body = response.json()
    assert '/' in body['output']
    assert body['exitCode'] == 0


def test_execute_command_echo(sandbox_id):
    """Test executing echo command."""
    test_string = 'test_' + str(int(__import__('time').time()))
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={'command': f'echo {test_string}'}
    )
    assert response.status_code == 200

    body = response.json()
    assert body['output'].strip() == test_string
    assert body['exitCode'] == 0


def test_execute_command_multiline(sandbox_id):
    """Test executing multi-line command."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={'command': 'echo line1\necho line2\necho line3'}
    )
    assert response.status_code == 200

    body = response.json()
    lines = body['output'].strip().split('\n')
    assert 'line1' in lines
    assert 'line2' in lines
    assert 'line3' in lines
    assert body['exitCode'] == 0


def test_execute_command_nonexistent(sandbox_id):
    """Test executing nonexistent command returns non-zero exit code."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={'command': 'nonexistent_command_123456'}
    )
    assert response.status_code == 200

    body = response.json()
    assert body['exitCode'] > 0


def test_execute_command_missing_field(sandbox_id):
    """Test missing command field returns 400."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        json={}
    )
    assert response.status_code == 400

    body = response.json()
    assert 'error' in body


def test_execute_command_invalid_json(sandbox_id):
    """Test invalid JSON returns 400."""
    response = requests.post(
        f'{API_BASE}/sandbox/{sandbox_id}/command',
        data='not valid json',
        headers={'Content-Type': 'application/json'}
    )
    assert response.status_code == 400


def test_delete_sandbox():
    """Test deleting a sandbox."""
    # Create a sandbox to delete
    create_resp = requests.post(f'{API_BASE}/sandbox', json={})
    sandbox = create_resp.json()

    response = requests.delete(f'{API_BASE}/sandbox/{sandbox["id"]}')
    assert response.status_code == 204

    # Should return 404 after deletion
    info_resp = requests.get(f'{API_BASE}/sandbox/{sandbox["id"]}')
    assert info_resp.status_code == 404


def test_delete_and_recreate():
    """Test creating new sandbox after deletion."""
    # Create first sandbox
    create_resp1 = requests.post(f'{API_BASE}/sandbox', json={})
    sandbox1 = create_resp1.json()

    # Delete it
    requests.delete(f'{API_BASE}/sandbox/{sandbox1["id"]}')

    # Create new sandbox should get new ID
    create_resp2 = requests.post(f'{API_BASE}/sandbox', json={})
    assert create_resp2.status_code == 200
    sandbox2 = create_resp2.json()

    assert sandbox2['id'] != sandbox1['id']


def test_concurrent_commands(sandbox_id):
    """Test concurrent command execution."""
    import concurrent.futures

    commands = ['echo cmd1', 'echo cmd2', 'echo cmd3']

    def exec_cmd(cmd):
        response = requests.post(
            f'{API_BASE}/sandbox/{sandbox_id}/command',
            json={'command': cmd}
        )
        return response.json()

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        futures = [executor.submit(exec_cmd, cmd) for cmd in commands]
        results = [f.result() for f in concurrent.futures.as_completed(futures)]

    for result in results:
        assert result['exitCode'] == 0


def test_cors_options():
    """Test CORS preflight request."""
    response = requests.options(f'{API_BASE}/sandbox')
    assert response.status_code == 204
