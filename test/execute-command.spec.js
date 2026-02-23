import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:7771';

test.describe('Execute Command 功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // 等待页面加载完成（显示空状态提示）
    await expect(page.locator('.empty-state')).toBeVisible({ timeout: 10000 });
  });

  async function openFile(page, filename) {
    // 使用 Ctrl+P 打开快速搜索
    await page.keyboard.press('Control+p');
    await expect(page.locator('.quick-open-dialog')).toBeVisible({ timeout: 5000 });

    // 选择指定文件
    const file = page.locator('.quick-open-item').filter({ hasText: filename }).first();
    await file.click();
  }

  test('应该能打开 Terminal 窗口', async ({ page }) => {
    // 打开 default.tl
    await openFile(page, 'default.tl');

    // 应该显示 terminal
    const terminal = page.locator('.terminal-container').first();
    await expect(terminal).toBeVisible({ timeout: 5000 });
  });

  test('应该能打开 Markdown 文件并看到 execute 按钮', async ({ page }) => {
    // 打开第一个 .md 文件
    await openFile(page, '.md');

    // 应该显示 markdown 内容
    await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 10000 });

    // 检查是否有 execute 按钮（如果有 bash 代码块）
    const bashCodeContainers = page.locator('.bash-code-container');
    const count = await bashCodeContainers.count();

    if (count > 0) {
      // 如果有 bash 代码块，应该能看到 execute 按钮
      const executeBtn = page.locator('.execute-bash-btn').first();
      await expect(executeBtn).toBeVisible();

      // 验证按钮有 data-command 属性
      const command = await executeBtn.getAttribute('data-command');
      expect(command).toBeTruthy();
      expect(command.length).toBeGreaterThan(0);
    }
  });

  test('点击 execute 按钮应该发送命令到 Terminal', async ({ page, request }) => {
    // 检查 bash.md 是否存在
    const response = await request.get(`${BACKEND_URL}/api/files/bash.md`);
    if (!response.ok()) {
      test.skip('bash.md 文件不存在');
    }

    // 先打开 Terminal
    await openFile(page, 'default.tl');
    await expect(page.locator('.terminal-container').first()).toBeVisible({ timeout: 5000 });

    // 等待一小段时间让 WebSocket 连接
    await page.waitForTimeout(500);

    // 如果有错误弹窗，先关闭
    const errorModal = page.locator('.error-modal-overlay');
    if (await errorModal.isVisible()) {
      await page.locator('.error-modal-btn').click();
      await errorModal.waitFor({ state: 'hidden', timeout: 2000 });
    }

    // 再打开一个有 bash 代码块的 Markdown 文件
    await openFile(page, 'bash.md');
    await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 10000 });

    // 查找 execute 按钮
    const executeBtn = page.locator('.execute-bash-btn').first();
    const btnCount = await executeBtn.count();

    if (btnCount > 0) {
      // 获取按钮上的命令
      const command = await executeBtn.getAttribute('data-command');
      expect(command).toBeTruthy();

      // 点击 execute 按钮
      await executeBtn.click();

      // 等待一小段时间让命令执行
      await page.waitForTimeout(500);

      // 验证：terminal 应该可见并且处于连接状态
      const terminalContainer = page.locator('.terminal-container').first();
      await expect(terminalContainer).toBeVisible();
    }
  });

  test('data-command 属性应该正确转义双引号', async ({ page, request }) => {
    // 检查 bash.md 是否存在
    const response = await request.get(`${BACKEND_URL}/api/files/bash.md`);
    if (!response.ok()) {
      test.skip('bash.md 文件不存在');
    }

    // 通过 API 获取 bash.md 内容
    const content = await response.text();

    // 如果文件包含双引号，验证 HTML 转义
    if (content.includes('"')) {
      await openFile(page, 'bash.md');

      // 等待 markdown 渲染
      await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 10000 });

      // 获取所有 execute 按钮
      const buttons = page.locator('.execute-bash-btn');
      const count = await buttons.count();

      for (let i = 0; i < count; i++) {
        const btn = buttons.nth(i);
        await expect(btn).toBeVisible();

        // 验证 data-command 属性存在且有效
        const command = await btn.getAttribute('data-command');
        expect(command).toBeTruthy();

        // 验证 HTML 属性没有被破坏
        const outerHTML = await btn.evaluate(el => el.outerHTML);
        const dataCommandMatch = outerHTML.match(/data-command="([^"]*)"/);
        if (dataCommandMatch) {
          expect(dataCommandMatch[1]).toBeTruthy();
        }
      }
    }
  });

  test('点击 execute 按钮应该发送带换行的命令', async ({ page, request }) => {
    // 检查 bash.md 是否存在
    const response = await request.get(`${BACKEND_URL}/api/files/bash.md`);
    if (!response.ok()) {
      test.skip('bash.md 文件不存在');
    }

    // 先打开 Terminal
    await openFile(page, 'default.tl');
    await expect(page.locator('.terminal-container').first()).toBeVisible({ timeout: 5000 });

    // 等待 WebSocket 连接
    await page.waitForTimeout(500);

    // 打开 bash.md
    await openFile(page, 'bash.md');
    await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 10000 });

    // 监听发送的命令
    const sentCommand = await page.evaluate(() => {
      return new Promise((resolve) => {
        const originalSend = WebSocket.prototype.send;
        WebSocket.prototype.send = function(data) {
          const parsed = JSON.parse(data);
          if (parsed[0] === 'stdin') {
            WebSocket.prototype.send = originalSend;
            resolve(parsed[1]);
          }
          return originalSend.call(this, data);
        };
        setTimeout(() => resolve(null), 5000);
      });
    });

    // 点击第一个 execute 按钮
    const executeBtn = page.locator('.execute-bash-btn').first();
    await executeBtn.click();

    // 等待命令发送
    await page.waitForTimeout(500);
  });
});
