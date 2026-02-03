import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:7771';

test.describe('Bash代码块执行测试', () => {
  test('应该为bash代码块显示执行按钮', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // 等待应用加载
    await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.files li').first()).toBeVisible({ timeout: 10000 });

    // 查找包含 "bash.md" 的文件项
    const bashFileItem = page.locator('.files li').filter({ hasText: /bash\.md/i }).first();
    await expect(bashFileItem).toBeVisible({ timeout: 5000 });
    await bashFileItem.click();

    // 等待 markdown 内容加载
    await expect(page.locator('.markdown-content')).toBeVisible({ timeout: 5000 });

    // 等待执行按钮出现（由于 DOM 操作是异步的）
    const executeButtons = page.locator('.execute-bash-btn');
    await expect(executeButtons.first()).toBeVisible({ timeout: 5000 });

    // 验证有执行按钮
    const finalButtonCount = await executeButtons.count();
    expect(finalButtonCount).toBeGreaterThan(0);

    // 验证按钮文本正确
    const firstButtonText = await executeButtons.first().textContent();
    expect(firstButtonText).toMatch(/▶\s*Execute/i);
  });

  test('点击执行按钮应该发送命令到终端', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // 等待应用加载
    await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

    // 查找包含 "bash.md" 的文件项
    const bashFileItem = page.locator('.files li').filter({ hasText: /bash\.md/i }).first();
    await expect(bashFileItem).toBeVisible({ timeout: 5000 });
    await bashFileItem.click();

    // 等待 markdown 内容加载
    await expect(page.locator('.markdown-content')).toBeVisible({ timeout: 5000 });

    // 等待终端连接成功 (reconnect-overlay 消失表示已连接)
    await expect(page.locator('.reconnect-overlay')).not.toBeVisible({ timeout: 10000 });

    // 等待执行按钮出现
    const executeButtons = page.locator('.execute-bash-btn');
    await expect(executeButtons.first()).toBeVisible({ timeout: 5000 });

    // 获取按钮上的命令
    const firstExecuteButton = executeButtons.first();
    const commandText = await firstExecuteButton.getAttribute('data-command');
    expect(commandText).toBeTruthy();
    console.log('Command to execute:', commandText);

    // 点击执行按钮（使用 force: true 避免被其他元素拦截）
    await firstExecuteButton.click({ force: true });

    // 等待命令执行并验证输出
    await expect(async () => {
      const terminalOutput = await page.evaluate(() => {
        if (window.terminalInstance && window.terminalInstance.buffer) {
          const buffer = window.terminalInstance.buffer.active;
          const lines = [];
          // 获取完整缓冲区
          for (let i = 0; i < buffer.length; i++) {
            const line = buffer.getLine(i);
            if (line) {
              lines.push(`Line ${i}: ${line.translateToString()}`);
            }
          }
          return lines.join('\n');
        }
        return '';
      });

      console.log('Full terminal buffer:', terminalOutput);

      // 检查命令是否执行 - 至少ls命令应该有输出
      // 查找常见的目录列表特征
      const hasLsOutput = terminalOutput.includes('drwx') || terminalOutput.includes('admin') || terminalOutput.includes('root');

      // 检查echo输出
      const hasEchoOutput = terminalOutput.includes('这是一个简单的echo命令') || terminalOutput.includes('多行输出');

      console.log(`Debug - hasLsOutput: ${hasLsOutput}, hasEchoOutput: ${hasEchoOutput}`);

      // 验证至少ls命令执行了
      expect(hasLsOutput || hasEchoOutput).toBeTruthy();
    }).toPass({ timeout: 5000 });
  });
});