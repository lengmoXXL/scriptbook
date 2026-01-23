import { test, expect } from '@playwright/test';

test('终端页面加载', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // 等待Vue应用加载
  await page.waitForTimeout(2000);
  // 检查.terminal元素是否存在
  await expect(page.locator('.terminal').first()).toBeVisible({ timeout: 10000 });
});
