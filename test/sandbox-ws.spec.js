import { test, expect } from '@playwright/test';
import { cleanupSandboxes } from './helpers.js';

const BACKEND_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080/ws/sandbox';
const API_BASE = `${BACKEND_URL}/api`;

// 共享的 sandbox ID
let sharedSandboxId = null;

test.beforeAll(async ({ request }) => {
    // 创建共享的 sandbox
    const response = await request.post(`${API_BASE}/sandbox`, { data: {} });
    expect(response.ok()).toBe(true);
    const body = await response.json();
    sharedSandboxId = body.id;
});

test.afterAll(async ({ request }) => {
    test.setTimeout(60000);
    // 清理所有 sandbox（包括共享的）
    await cleanupSandboxes(request);
});

test.describe('Sandbox WebSocket 测试', () => {
  test.describe('WebSocket 连接', () => {
    test('应该成功建立 WebSocket 连接并收到 connected 消息', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve, reject) => {
          ws.onopen = resolve;
          ws.onerror = reject;
        });

        // 等待 connected 消息
        await new Promise((resolve, reject) => {
          const checkConnected = () => {
            if (messages.some(m => m.type === 'connected')) {
              resolve();
            } else {
              setTimeout(checkConnected, 50);
            }
          };
          checkConnected();
        });

        const connectedMsg = messages.find(m => m.type === 'connected');

        ws.close();
        return { connectedMsg };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.connectedMsg).toBeDefined();
      expect(result.connectedMsg.type).toBe('connected');
      expect(result.connectedMsg.sandbox_id).toBe(sharedSandboxId);
    });

    test('连接不存在的 sandbox 应该返回错误并关闭连接', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl }) => {
        return new Promise((resolve) => {
          const ws = new WebSocket(`${wsUrl}/nonexistent_123456`);

          const messages = [];
          let resolved = false;

          const onMessage = (event) => {
            const msg = JSON.parse(event.data);
            messages.push(msg);
            if (msg.type === 'error') {
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('close', onClose);
              ws.close();
              resolved = true;
              resolve({ connected: true, errorMsg: msg.error });
            }
          };

          const onError = () => {
            ws.removeEventListener('error', onError);
            resolved = true;
            resolve({ connected: false, networkError: true });
          };

          const onClose = () => {
            if (!resolved) {
              resolve({ connected: true, closedByServer: true });
            }
          };

          ws.addEventListener('message', onMessage);
          ws.addEventListener('error', onError);
          ws.addEventListener('close', onClose);

          setTimeout(() => {
            if (!resolved) {
              ws.removeEventListener('message', onMessage);
              ws.removeEventListener('error', onError);
              ws.removeEventListener('close', onClose);
              resolve({ connected: false, timeout: true });
            }
          }, 5000);
        });
      }, { wsUrl: WS_URL });

      expect(result.connected).toBe(true);
      expect(result.errorMsg || result.closedByServer).toBeTruthy();
    });
  });

  test.describe('命令执行 - 流式输出', () => {
    test('应该成功执行简单命令并接收输出', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        // 等待 connected 消息
        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        // 发送命令
        ws.send(JSON.stringify({ command: 'echo hello world' }));

        // 等待命令完成
        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'done')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const doneMsg = messages.find(m => m.type === 'done');
        const stdoutMsgs = messages.filter(m => m.type === 'stdout');

        ws.close();
        return { doneMsg, stdoutMsgs, messages };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.doneMsg.exit_code).toBe(0);
      expect(result.doneMsg.has_error).toBe(false);
      expect(result.stdoutMsgs.length).toBeGreaterThan(0);
      const combinedOutput = result.stdoutMsgs.map(m => m.content).join('');
      expect(combinedOutput).toContain('hello world');
    });

    test('应该接收多行输出', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        ws.send(JSON.stringify({ command: 'echo line1\necho line2\necho line3' }));

        await new Promise((resolve, reject) => {
          const check = () => {
            if (messages.some(m => m.type === 'done')) resolve();
            else if (messages.some(m => m.type === 'error')) reject(new Error('Command failed'));
            else setTimeout(check, 50);
          };
          check();
        });

        const stdoutMsgs = messages.filter(m => m.type === 'stdout');

        ws.close();
        return { stdoutMsgs };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      const combinedOutput = result.stdoutMsgs.map(m => m.content).join('');
      expect(combinedOutput).toContain('line1');
      expect(combinedOutput).toContain('line2');
      expect(combinedOutput).toContain('line3');
    });

    test('应该正确处理不存在的命令', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        ws.send(JSON.stringify({ command: 'nonexistent_command_123456' }));

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'done')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const doneMsg = messages.find(m => m.type === 'done');

        ws.close();
        return { doneMsg };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.doneMsg.exit_code).toBeGreaterThan(0);
      expect(result.doneMsg.has_error).toBe(true);
    });

    test('应该实时接收多次输出的命令', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        const timestamps = [];
        ws.onmessage = (event) => {
          const msg = JSON.parse(event.data);
          messages.push(msg);
          if (msg.type === 'stdout') {
            timestamps.push(Date.now());
          }
        };

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        // 发送会产生多次输出的命令
        ws.send(JSON.stringify({ command: 'for i in 1 2 3; do echo "output $i"; done' }));

        // 等待命令完成（最多15秒）
        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'done')) resolve();
            else setTimeout(check, 100);
          };
          const timeout = setTimeout(() => resolve(), 15000);
          const originalCheck = check;
          const wrappedCheck = () => {
            if (messages.some(m => m.type === 'done')) {
              clearTimeout(timeout);
              resolve();
            } else {
              originalCheck();
            }
          };
          wrappedCheck();
        });

        const stdoutMsgs = messages.filter(m => m.type === 'stdout');
        const doneMsg = messages.find(m => m.type === 'done');

        ws.close();
        return { stdoutMsgs, doneMsg, timestamps, messageCount: messages.length };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      // 验证收到了3次输出
      expect(result.stdoutMsgs.length).toBe(3);
      // 验证每次输出内容
      expect(result.stdoutMsgs[0].content).toContain('output 1');
      expect(result.stdoutMsgs[1].content).toContain('output 2');
      expect(result.stdoutMsgs[2].content).toContain('output 3');
      // 验证命令完成
      expect(result.doneMsg).toBeDefined();
      expect(result.doneMsg.exit_code).toBe(0);
    });
  });

  test.describe('错误处理', () => {
    test('缺少 command 字段应该返回错误', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        // 发送空命令
        ws.send(JSON.stringify({}));

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'error')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const errorMsg = messages.find(m => m.type === 'error');

        ws.close();
        return { errorMsg };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.errorMsg).toBeDefined();
      expect(result.errorMsg.error).toContain('Command is required');
    });

    test('无效 JSON 应该返回错误', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        // 发送无效 JSON
        ws.send('not valid json');

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'error')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const errorMsg = messages.find(m => m.type === 'error');

        ws.close();
        return { errorMsg };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.errorMsg).toBeDefined();
      expect(result.errorMsg.error).toContain('Invalid JSON message');
    });
  });

  test.describe('多命令执行', () => {
    test('应该能够顺序执行多个命令', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const commands = ['echo cmd1', 'echo cmd2', 'echo cmd3'];
        const doneCountBefore = messages.filter(m => m.type === 'done').length;

        // 发送多个命令
        for (const cmd of commands) {
          ws.send(JSON.stringify({ command: cmd }));
        }

        // 等待所有命令完成
        await new Promise((resolve) => {
          const check = () => {
            const doneCount = messages.filter(m => m.type === 'done').length;
            if (doneCount >= doneCountBefore + commands.length) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        const doneCountAfter = messages.filter(m => m.type === 'done').length;

        ws.close();
        return { doneCountBefore, doneCountAfter };
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      expect(result.doneCountAfter - result.doneCountBefore).toBe(3);
    });
  });

  test.describe('连接关闭', () => {
    test('客户端应该能够主动关闭连接', async ({ page }) => {
      const result = await page.evaluate(async ({ wsUrl, sandboxId }) => {
        const ws = new WebSocket(`${wsUrl}/${sandboxId}`);

        const messages = [];
        ws.onmessage = (event) => messages.push(JSON.parse(event.data));

        await new Promise((resolve) => ws.onopen = resolve);

        await new Promise((resolve) => {
          const check = () => {
            if (messages.some(m => m.type === 'connected')) resolve();
            else setTimeout(check, 50);
          };
          check();
        });

        ws.close();

        // 等待一小段时间确保不会收到新消息
        await new Promise(resolve => setTimeout(resolve, 500));

        return messages.length;
      }, { wsUrl: WS_URL, sandboxId: sharedSandboxId });

      // 连接关闭后消息数量应该固定（只有 connected 消息）
      expect(result).toBeGreaterThan(0);
    });
  });
});
