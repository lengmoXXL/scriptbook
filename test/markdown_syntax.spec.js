import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:7771';

test.describe('Terminal 文件浏览测试', () => {
  test.describe('后端文件 API', () => {
    test('应该返回 .tl 文件列表', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/files`);
      expect(response.ok()).toBe(true);

      const files = await response.json();
      expect(Array.isArray(files)).toBe(true);

      const tlFiles = files.filter(f => f.endsWith('.tl'));
      expect(tlFiles.length).toBeGreaterThan(0);
    });

    test('应该返回 .tl 文件内容', async ({ request }) => {
      const listResponse = await request.get(`${BACKEND_URL}/api/files`);
      expect(listResponse.ok()).toBe(true);

      const files = await listResponse.json();
      const tlFiles = files.filter(f => f.endsWith('.tl'));

      if (tlFiles.length > 0) {
        const filename = tlFiles[0];
        const contentResponse = await request.get(`${BACKEND_URL}/api/files/${filename}`);
        expect(contentResponse.ok()).toBe(true);

        const content = await contentResponse.text();
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('前端 Terminal 文件浏览', () => {
    test('应该显示 .tl 文件列表并可以点击', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();

      // 应该显示 terminal 内部文件列表
      await expect(page.locator('.files li').filter({ hasText: '.md' }).first()).toBeVisible({ timeout: 10000 });
    });

    test('应该能查看 markdown 文件内容', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });

      // 点击第一个 .md 文件
      const mdFile = page.locator('.files li').filter({ hasText: '.md' }).first();
      await mdFile.click();

      // 应该显示 markdown 内容
      await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 10000 });
    });
  });
});
