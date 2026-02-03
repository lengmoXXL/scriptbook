import { test, expect } from '@playwright/test';

test('终端页面加载', async ({ page }) => {
  await page.goto('http://localhost:7771');
  // 等待文件列表加载完成
  await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
  // 等待终端组件初始化
  await expect(page.locator('.terminal-container')).toBeVisible({ timeout: 10000 });
  // 等待 WebSocket 连接建立（重连覆盖层消失）
  await expect(page.locator('.reconnect-overlay')).not.toBeVisible({ timeout: 10000 });
});

test('应该正确执行 echo 命令并验证输出', async ({ page }) => {
  await page.goto('http://localhost:7771');
  // 等待应用完全加载
  await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.terminal-container')).toBeVisible({ timeout: 10000 });
  // 等待 WebSocket 连接成功
  await expect(page.locator('.reconnect-overlay')).not.toBeVisible({ timeout: 10000 });
  // 等待终端输入区域可用
  await expect(page.locator('.xterm-helper-textarea')).toBeVisible({ timeout: 5000 });

  // 点击终端区域来聚焦
  await page.locator('.xterm-screen').click();

  // 等待终端聚焦
  await expect(async () => {
    const isFocused = await page.evaluate(() => {
      return document.querySelector('.xterm-helper-textarea') === document.activeElement;
    });
    expect(isFocused).toBe(true);
  }).toPass({ timeout: 2000 });

  // 使用 keyboard.type 模拟输入
  await page.keyboard.type('echo hello_world');
  await page.keyboard.press('Enter');

  // 等待命令执行完成并验证输出
  await expect(async () => {
    const terminalOutput = await page.evaluate(() => {
      if (window.terminalInstance && window.terminalInstance.buffer) {
        const buffer = window.terminalInstance.buffer.active;
        const lines = [];
        const startLine = Math.max(0, buffer.length - 10);
        for (let i = startLine; i < buffer.length; i++) {
          const line = buffer.getLine(i);
          if (line) {
            lines.push(line.translateToString());
          }
        }
        return lines.join('\n');
      }
      return '';
    });
    expect(terminalOutput).toMatch(/hello_world/);
  }).toPass({ timeout: 3000 });
});
