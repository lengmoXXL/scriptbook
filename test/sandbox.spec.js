import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';
const API_BASE = `${BACKEND_URL}/api`;

test.describe('Sandbox API 测试', () => {
  test.describe('POST /api/sandbox - 创建 Sandbox', () => {
    test('应该返回 sandbox ID 和状态', async ({ request }) => {
      const response = await request.post(`${API_BASE}/sandbox`, { data: {} });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body).toHaveProperty('id');
      expect(typeof body.id).toBe('string');
      expect(body.id.length).toBeGreaterThan(0);

      expect(body).toHaveProperty('status');
      expect(typeof body.status).toBe('string');
    });

    test('每次调用应该创建新的 sandbox', async ({ request }) => {
      // 第一次调用创建 sandbox
      const response1 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      expect(response1.ok()).toBe(true);
      const body1 = await response1.json();
      const sandboxId1 = body1.id;

      // 第二次调用应该创建新的 sandbox
      const response2 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      expect(response2.ok()).toBe(true);
      const body2 = await response2.json();
      expect(body2.id).not.toBe(sandboxId1);
    });

    test('应该返回正确的 Content-Type', async ({ request }) => {
      const response = await request.post(`${API_BASE}/sandbox`, { data: {} });
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('application/json');
    });
  });

  test.describe('GET /api/sandbox - 列出所有 Sandbox', () => {
    test('应该返回 sandbox 列表', async ({ request }) => {
      // 先创建几个 sandbox
      const create1 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sb1 = await create1.json();
      const create2 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sb2 = await create2.json();

      // 列出所有 sandbox
      const response = await request.get(`${API_BASE}/sandbox`);
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(Array.isArray(body)).toBe(true);

      // 包含创建的 sandbox
      const ids = body.map((sb) => sb.id);
      expect(ids).toContain(sb1.id);
      expect(ids).toContain(sb2.id);
    });
  });

  test.describe('POST /api/sandbox/{sandboxId}/command - 执行命令', () => {
    test('应该成功执行 ls 命令', async ({ request }) => {
      // 先获取 sandbox
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: 'ls' }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body).toHaveProperty('output', expect.any(String));
      expect(body).toHaveProperty('error', expect.any(String));
      expect(body).toHaveProperty('exitCode', expect.any(Number));
      expect(body.exitCode).toBe(0);
    });

    test('应该成功执行 pwd 命令', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: 'pwd' }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body.output).toContain('/');
      expect(body.exitCode).toBe(0);
    });

    test('应该成功执行 echo 命令', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const testString = 'test_' + Date.now();
      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: `echo ${testString}` }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body.output.trim()).toBe(testString);
      expect(body.exitCode).toBe(0);
    });

    test('应该成功执行多行命令', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: 'echo line1\necho line2\necho line3' }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      const lines = body.output.trim().split('\n');
      expect(lines).toContain('line1');
      expect(lines).toContain('line2');
      expect(lines).toContain('line3');
      expect(body.exitCode).toBe(0);
    });

    test('应该成功执行环境变量相关命令', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: 'echo $HOME' }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body.output.trim()).toContain('/');
      expect(body.exitCode).toBe(0);
    });

    test('应该处理不存在的命令', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: { command: 'nonexistent_command_123456' }
      });
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body.exitCode).toBeGreaterThan(0);
    });

    test('缺少 command 应该返回错误', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        data: {}
      });
      expect(response.status()).toBe(400);

      const body = await response.json();
      expect(body).toHaveProperty('error');
    });

    test('无效 JSON 应该返回错误', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      // 发送真正的无效 JSON（不是有效的 Python dict 表示）
      const response = await request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
        postData: 'not valid json at all',
        headers: { 'Content-Type': 'application/json' }
      });

      const body = await response.json();

      expect(response.status()).toBe(400);
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('GET /api/sandbox/{sandboxId} - 获取 Sandbox 信息', () => {
    test('应该返回 sandbox 详细信息', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.get(`${API_BASE}/sandbox/${sandbox.id}`);
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body).toHaveProperty('id', sandbox.id);
      expect(body).toHaveProperty('status');
      expect(typeof body.status).toBe('string');
    });

    test('应该返回正确的 Content-Type', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.get(`${API_BASE}/sandbox/${sandbox.id}`);
      expect(response.ok()).toBe(true);
      expect(response.headers()['content-type']).toContain('application/json');
    });

    test('查询不存在的 sandbox 应该返回 404', async ({ request }) => {
      const response = await request.get(`${API_BASE}/sandbox/nonexistent_123456`);
      expect(response.status()).toBe(404);

      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('DELETE /api/sandbox/{sandboxId} - 销毁 Sandbox', () => {
    test('应该成功销毁 sandbox', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      const response = await request.delete(`${API_BASE}/sandbox/${sandbox.id}`);
      expect(response.status()).toBe(204);

      // 销毁后再查询应该返回 404
      const infoResp = await request.get(`${API_BASE}/sandbox/${sandbox.id}`);
      expect(infoResp.status()).toBe(404);
    });

    test('销毁后应该能够创建新的 sandbox', async ({ request }) => {
      // 创建第一个 sandbox
      const createResp1 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox1 = await createResp1.json();

      // 销毁
      await request.delete(`${API_BASE}/sandbox/${sandbox1.id}`);

      // 创建新的 sandbox（应该得到新的 ID）
      const createResp2 = await request.post(`${API_BASE}/sandbox`, { data: {} });
      expect(createResp2.ok()).toBe(true);
      const sandbox2 = await createResp2.json();

      // 新创建的 sandbox 应该有不同的 ID
      expect(sandbox2.id).not.toBe(sandbox1.id);
    });
  });

  test.describe('错误处理', () => {
    test('OPTIONS 请求应该成功（CORS 预检）', async ({ page }) => {
      const response = await page.evaluate(async (url) => {
        const resp = await fetch(url, { method: 'OPTIONS' });
        return resp.status;
      }, `${API_BASE}/sandbox`);

      expect(response).toBe(204);
    });

    test('无效路径应该返回错误', async ({ request }) => {
      // 请求一个不存在的 sandbox，直接测试 404 响应
      const response = await request.get(`${API_BASE}/sandbox/nonexistent_123456789`);
      expect(response.status()).toBe(404);

      const body = await response.json();
      expect(body).toHaveProperty('error');
    });
  });

  test.describe('并发操作', () => {
    test('多个并发命令执行应该互不干扰', async ({ request }) => {
      const createResp = await request.post(`${API_BASE}/sandbox`, { data: {} });
      const sandbox = await createResp.json();

      // 并发执行多个命令
      const commands = ['echo cmd1', 'echo cmd2', 'echo cmd3'];
      const promises = commands.map(cmd =>
        request.post(`${API_BASE}/sandbox/${sandbox.id}/command`, {
          data: { command: cmd }
        })
      );

      const responses = await Promise.all(promises);

      for (const response of responses) {
        expect(response.ok()).toBe(true);
        const body = await response.json();
        expect(body.exitCode).toBe(0);
      }
    });
  });
});
