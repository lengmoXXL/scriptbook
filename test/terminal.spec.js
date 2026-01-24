import { test, expect } from '@playwright/test';

test('终端页面加载', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // 等待Vue应用加载
  await page.waitForTimeout(2000);
  // 检查.terminal元素是否存在（现在终端是布局的一部分，无需切换）
  await expect(page.locator('.terminal').first()).toBeVisible({ timeout: 10000 });
});

test('应该正确执行 echo 命令并验证输出', async ({ page }) => {
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(2000);
  // 检查.terminal元素是否存在（现在终端是布局的一部分，无需切换）
  await expect(page.locator('.terminal').first()).toBeVisible({ timeout: 10000 });

  // 等待终端连接成功
  await expect(page.locator('.status.connected')).toBeVisible({ timeout: 10000 });

  // 等待终端完全初始化
  await page.waitForTimeout(500);

  // 检查终端是否准备就绪：应该有 xterm-helper-textarea
  await expect(page.locator('.xterm-helper-textarea')).toBeVisible({ timeout: 5000 });

  // 点击终端区域来聚焦
  await page.locator('.xterm-screen').click();

  // 确保终端获得焦点
  await page.waitForTimeout(200);
  const isFocused = await page.evaluate(() => {
    return document.querySelector('.xterm-helper-textarea') === document.activeElement;
  });
  expect(isFocused).toBe(true);

  // 使用 keyboard.type 模拟输入
  await page.keyboard.type('echo hello_world');
  await page.keyboard.press('Enter');

  // 等待命令执行
  await page.waitForTimeout(500);

  // 验证输出：检查最新的终端输出是否包含 hello_world
  // 通过 xterm.js 缓冲区获取文本内容
  const terminalOutput = await page.evaluate(() => {
    if (window.terminalInstance && window.terminalInstance.buffer) {
      const buffer = window.terminalInstance.buffer.active;
      // 从最后几行获取最新输出
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

  // 验证输出包含 hello_world（允许有空格或特殊字符）
  expect(terminalOutput).toMatch(/hello_world/);
});
