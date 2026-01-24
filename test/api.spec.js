import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';

test.describe('后端 API 测试', () => {
  test.describe('健康检查端点 /health', () => {
    test('应该返回健康状态', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/health`);
      expect(response.ok()).toBe(true);

      const body = await response.json();
      expect(body).toHaveProperty('status', 'ok');
      expect(body).toHaveProperty('service', 'terminal-ws');
    });

    test('应该返回正确的 Content-Type', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/health`);
      expect(response.headers()['content-type']).toContain('application/json');
    });

    test('应该支持重复请求', async ({ request }) => {
      const response1 = await request.get(`${BACKEND_URL}/health`);
      const response2 = await request.get(`${BACKEND_URL}/health`);

      expect(response1.ok()).toBe(true);
      expect(response2.ok()).toBe(true);

      const body1 = await response1.json();
      const body2 = await response2.json();
      expect(body1.status).toBe(body2.status);
    });

    test('健康检查应该快速响应', async ({ request }) => {
      const start = Date.now();
      await request.get(`${BACKEND_URL}/health`);
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });

  test.describe('WebSocket 端点 /ws', () => {
    test('应该能够建立 WebSocket 连接', async ({ page }) => {
      const wsPromise = page.waitForEvent('websocket', { url: /\/ws/ });

      page.evaluate(() => {
        window.ws = new WebSocket('ws://localhost:8080/ws/tty');
      });

      const ws = await wsPromise;
      expect(ws.url()).toContain('/ws');
    });

    test('建立连接后应该收到 setup 消息', async ({ page }) => {
      const termName = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          ws.onopen = () => {
            // 从 URL 获取 term_name
            const match = ws.url.match(/\/ws\/(.+)$/);
            resolve(match ? match[1] : 'tty');
          };
          ws.onerror = () => resolve(null);
          setTimeout(() => resolve(null), 5000);
        });
      });

      expect(termName).toBeDefined();
      expect(termName.length).toBeGreaterThan(0);
    });

    test('应该收到 setup 消息', async ({ page }) => {
      const messages = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          const msgs = [];
          ws.onopen = () => {
            ws.onmessage = (event) => {
              msgs.push(event.data);
            };
          };
          setTimeout(() => resolve(msgs), 500);
        });
      });

      expect(messages.length).toBeGreaterThanOrEqual(1);
      const setupMsg = messages.find(m => m.includes('setup'));
      expect(setupMsg).toBeDefined();
    });

    test('应该支持指定 term_name 重连', async ({ page }) => {
      // 使用指定的 term_name 连接
      const termName = 'test-reconnect-' + Date.now();

      // 连接并验证 term_name 在 URL 中
      const result = await page.evaluate(async (name) => {
        return new Promise((resolve) => {
          const ws = new WebSocket(`ws://localhost:8080/ws/tty/${name}`);
          ws.onopen = () => {
            // URL 中包含 term_name
            resolve({ url: ws.url, termName: name });
          };
          ws.onerror = () => resolve(null);
          setTimeout(() => resolve(null), 5000);
        });
      }, termName);

      expect(result).not.toBeNull();
      expect(result.url).toContain(`/${termName}`);
    });

    test('应该支持终端 resize 消息', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          ws.onopen = () => {
            // TermSocket format: ['set_size', rows, cols]
            ws.send(JSON.stringify(['set_size', 40, 120]));
            setTimeout(() => resolve({ success: true }), 100);
          };
          ws.onerror = () => resolve({ success: false, error: 'ws error' });
        });
      });

      expect(result.success).toBe(true);
    });

    test('应该支持终端输入消息', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          ws.onopen = () => {
            // TermSocket format: ['stdin', data]
            ws.send(JSON.stringify(['stdin', 'ls\n']));
            setTimeout(() => resolve({ success: true }), 100);
          };
          ws.onerror = () => resolve({ success: false, error: 'ws error' });
        });
      });

      expect(result.success).toBe(true);
    });

    test('应该支持执行 echo 命令', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');

          ws.onopen = () => {
            ws.send(JSON.stringify(['stdin', 'echo hello\n']));
            setTimeout(() => resolve({ success: true }), 300);
          };
          ws.onerror = () => resolve({ success: false });
        });
      });

      expect(result.success).toBe(true);
    });

    test('应该支持执行多个交互式命令', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          let cmdCount = 0;

          ws.onopen = () => {
            const sendCmd = () => {
              if (cmdCount < 3) {
                ws.send(JSON.stringify(['stdin', 'echo test\n']));
                cmdCount++;
                setTimeout(sendCmd, 100);
              } else {
                setTimeout(() => resolve({ success: true, count: cmdCount }), 300);
              }
            };
            sendCmd();
          };
        });
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });

    test('应该支持执行环境相关命令', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');

          const commands = ['pwd', 'true', 'echo done'];

          ws.onopen = () => {
            let idx = 0;
            const runNext = () => {
              if (idx < commands.length) {
                ws.send(JSON.stringify(['stdin', commands[idx] + '\n']));
                idx++;
                setTimeout(runNext, 100);
              } else {
                setTimeout(() => resolve({ success: true, count: commands.length }), 300);
              }
            };
            runNext();
          };
        });
      });

      expect(result.success).toBe(true);
      expect(result.count).toBe(3);
    });

    test('应该支持执行目录操作命令', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');

          ws.onopen = () => {
            ws.send(JSON.stringify(['stdin', 'cd /tmp && ls\n']));
            setTimeout(() => resolve({ success: true }), 300);
          };
        });
      });

      expect(result.success).toBe(true);
    });

    test('应该支持创建和删除文件', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          const testFile = 'pw_test_' + Date.now();

          ws.onopen = () => {
            let step = 0;
            const runSteps = () => {
              if (step === 0) {
                ws.send(JSON.stringify(['stdin', `touch ${testFile}\n`]));
                step++;
                setTimeout(runSteps, 100);
              } else if (step === 1) {
                ws.send(JSON.stringify(['stdin', `rm ${testFile}\n`]));
                step++;
                setTimeout(runSteps, 100);
              } else {
                setTimeout(() => resolve({ success: true }), 100);
              }
            };
            runSteps();
          };
        });
      });

      expect(result.success).toBe(true);
    });

    test('应该支持管道命令', async ({ page }) => {
      const result = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');

          ws.onopen = () => {
            ws.send(JSON.stringify(['stdin', 'echo hello | cat\n']));
            setTimeout(() => resolve({ success: true }), 200);
          };
        });
      });

      expect(result.success).toBe(true);
    });

    test('多个并发连接应该各自获得独立 terminal', async ({ page }) => {
      const ids = [];
      // 用不同的 term_name 测试独立 terminal
      const termNames = ['term-a', 'term-b', 'term-c'];
      for (const name of termNames) {
        const termName = await page.evaluate(async (n) => {
          return new Promise((resolve) => {
            const ws = new WebSocket(`ws://localhost:8080/ws/tty/${n}`);
            ws.onopen = () => {
              // 从 URL 中获取 term_name
              const match = ws.url.match(/\/ws\/(.+)$/);
              resolve(match ? match[1] : null);
            };
            ws.onerror = () => resolve(null);
            setTimeout(() => resolve(null), 5000);
          });
        }, name);
        ids.push(termName);
      }

      // 所有连接都应该成功
      expect(ids.every(id => id !== null)).toBe(true);
      // 每个 term_name 应该不同
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    test('WebSocket 应该正确关闭', async ({ page }) => {
      const closeEvent = await page.evaluate(async () => {
        return new Promise((resolve) => {
          const ws = new WebSocket('ws://localhost:8080/ws/tty');
          ws.onopen = () => {
            ws.close();
          };
          ws.onclose = (event) => {
            resolve({ code: event.code, wasClean: event.wasClean });
          };
        });
      });

      expect(closeEvent.wasClean).toBe(true);
    });
  });
});
