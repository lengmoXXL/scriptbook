import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:7771';

test.describe('Sandbox 文件浏览测试', () => {
  test.describe('后端文件 API', () => {
    test('应该返回 .sandbox 文件列表', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/files`);
      expect(response.ok()).toBe(true);

      const files = await response.json();
      expect(Array.isArray(files)).toBe(true);

      // 至少应该有一个 .sandbox 文件
      const sandboxFiles = files.filter(f => f.endsWith('.sandbox'));
      expect(sandboxFiles.length).toBeGreaterThan(0);
    });

    test('应该返回 .sandbox 文件内容', async ({ request }) => {
      // 首先获取文件列表
      const listResponse = await request.get(`${BACKEND_URL}/api/files`);
      expect(listResponse.ok()).toBe(true);

      const files = await listResponse.json();
      const sandboxFiles = files.filter(f => f.endsWith('.sandbox'));

      if (sandboxFiles.length > 0) {
        const filename = sandboxFiles[0];
        const contentResponse = await request.get(`${BACKEND_URL}/api/files/${filename}`);
        expect(contentResponse.ok()).toBe(true);

        const content = await contentResponse.text();
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('前端 Sandbox 文件浏览', () => {
    test('应该显示 .sandbox 文件列表并可以点击', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      // 等待文件列表加载完成
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      // 点击侧边栏中的第一个 .sandbox 文件
      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();

      // 等待 SandboxChat 加载
      await expect(page.locator('.sandbox-chat')).toBeVisible({ timeout: 10000 });
    });

    test('应该在 SandboxChat header 显示文件名', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });

      // 点击第一个 .sandbox 文件
      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();
      await expect(page.locator('.sandbox-chat')).toBeVisible({ timeout: 10000 });

      // header 应该显示文件名
      const headerText = await page.locator('.chat-header h3').textContent();
      expect(headerText).toMatch(/\.sandbox$/);
    });

    test('sandbox 文件应该有展开图标', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      // 查找 .sandbox 文件
      const sandboxFile = page.locator('.files li').filter({ hasText: '.sandbox' }).first();

      // 应该有展开图标
      const expandIcon = sandboxFile.locator('.expand-icon');
      await expect(expandIcon).toBeVisible({ timeout: 5000 });
      const iconText = await expandIcon.textContent();
      expect(iconText).toBe('▶');
    });
  });
});
