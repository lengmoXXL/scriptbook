import { test, expect } from '@playwright/test';

test.describe('SandboxChat Terminal', () => {
  test('应该能打开 Terminal 并执行命令', async ({ page }) => {
    await page.goto('http://localhost:7771');
    await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });

    // 点击 example.claude.sandbox 文件
    await page.locator('.files li:has-text("example.claude.sandbox")').click();

    // 等待 SandboxChat 加载
    await expect(page.locator('.sandbox-chat')).toBeVisible({ timeout: 10000 });

    // 等待 sandbox 创建完成（检查 Terminal 按钮是否显示）
    await expect(page.locator('.terminal-button:has-text("Terminal")')).toBeVisible({ timeout: 30000 });

    // 点击 Terminal 按钮
    await page.locator('.terminal-button:has-text("Terminal")').click();

    // 等待终端面板显示
    await expect(page.locator('.terminal-panel')).toBeVisible({ timeout: 5000 });

    // 等待终端内的 xterm 实例加载
    await expect(page.locator('.terminal-panel .xterm-helper-textarea')).toBeVisible({ timeout: 10000 });

    // 点击终端区域聚焦
    await page.locator('.terminal-panel .xterm-screen').click();

    // 等待终端聚焦
    await expect(async () => {
      const isFocused = await page.evaluate(() => {
        const termTextareas = document.querySelectorAll('.xterm-helper-textarea');
        // 找到 terminal-panel 内的 textarea
        for (const textarea of termTextareas) {
          if (textarea.closest('.terminal-panel')) {
            return textarea === document.activeElement;
          }
        }
        return false;
      });
      expect(isFocused).toBe(true);
    }).toPass({ timeout: 2000 });

    // 执行命令
    await page.keyboard.type('echo sandbox_test');
    await page.keyboard.press('Enter');

    // 验证输出
    await expect(async () => {
      const output = await page.evaluate(() => {
        // 查找 terminal-panel 内的 terminal 实例
        const terminalPanel = document.querySelector('.terminal-panel');
        if (!terminalPanel) return '';

        // 通过 class 找到对应的 terminal 实例
        const terminals = terminalPanel.querySelectorAll('.xterm-screen');
        if (terminals.length === 0) return '';

        // 获取最后一行输出
        const rows = terminalPanel.querySelectorAll('.xterm-rows');
        if (rows.length === 0) return '';

        const textContent = rows[0].textContent || '';
        return textContent;
      });
      expect(output).toContain('sandbox_test');
    }).toPass({ timeout: 5000 });
  });

  test('应该能拖拽调整 Terminal 大小', async ({ page }) => {
    await page.goto('http://localhost:7771');
    await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });

    await page.locator('.files li:has-text("example.claude.sandbox")').click();
    await expect(page.locator('.sandbox-chat')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.terminal-button:has-text("Terminal")')).toBeVisible({ timeout: 30000 });

    await page.locator('.terminal-button:has-text("Terminal")').click();
    await expect(page.locator('.terminal-panel')).toBeVisible({ timeout: 5000 });

    // 获取初始高度
    const initialHeight = await page.locator('.terminal-panel').evaluate(el => el.getBoundingClientRect().height);

    // 拖拽 resize handle
    const handle = page.locator('.terminal-resize-handle');
    const box = await handle.boundingBox();

    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, 50, { steps: 10 });
      await page.mouse.up();

      // 验证高度变化
      const newHeight = await page.locator('.terminal-panel').evaluate(el => el.getBoundingClientRect().height);
      expect(newHeight).toBeGreaterThan(initialHeight);
    }
  });
});
