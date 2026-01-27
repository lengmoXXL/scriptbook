import { test, expect } from '@playwright/test';

const BACKEND_URL = 'http://localhost:8080';
const FRONTEND_URL = 'http://localhost:5173';

test.describe('Markdown 渲染测试', () => {
  test.describe('后端文件 API', () => {
    test('应该返回文件列表', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/files`);
      expect(response.ok()).toBe(true);

      const files = await response.json();
      expect(Array.isArray(files)).toBe(true);

      // 至少应该有一个 .md 文件
      const mdFiles = files.filter(f => f.endsWith('.md'));
      expect(mdFiles.length).toBeGreaterThan(0);
    });

    test('应该返回文件内容', async ({ request }) => {
      // 首先获取文件列表
      const listResponse = await request.get(`${BACKEND_URL}/api/files`);
      expect(listResponse.ok()).toBe(true);

      const files = await listResponse.json();
      const mdFiles = files.filter(f => f.endsWith('.md'));

      if (mdFiles.length > 0) {
        const filename = mdFiles[0];
        const contentResponse = await request.get(`${BACKEND_URL}/api/files/${filename}`);
        expect(contentResponse.ok()).toBe(true);

        const content = await contentResponse.text();
        expect(typeof content).toBe('string');
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  test.describe('前端 Markdown 渲染', () => {
    test('应该显示文件列表并可以点击文件', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      // 等待文件列表加载完成
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      // 点击侧边栏中的第一个文件以加载内容
      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();

      // 等待 markdown 内容加载完成
      await expect(page.locator('.markdown-viewer')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('.markdown-content')).toBeVisible({ timeout: 5000 });
    });

    test('应该正确渲染 markdown 格式', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      // 等待应用加载
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      // 点击侧边栏中的第一个文件
      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();

      // 等待 markdown 内容加载
      const markdownContent = page.locator('.markdown-content');
      await expect(markdownContent).toBeVisible({ timeout: 5000 });

      // Markdown视图现在是布局的一部分，无需切换按钮

      // 验证一些基本的 markdown 元素可能存在
      // 由于文件内容未知，我们只检查容器不为空
      await expect(async () => {
        const contentHtml = await markdownContent.innerHTML();
        expect(contentHtml.length).toBeGreaterThan(0);
      }).toPass({ timeout: 2000 });

      // 检查没有错误消息
      await expect(page.locator('.error-message')).not.toBeVisible({ timeout: 1000 });
      await expect(page.locator('.loading-message')).not.toBeVisible({ timeout: 1000 });
    });

    test('应该在文件选择时显示文件名', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      // 等待应用加载
      await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('.files li').first()).toBeVisible({ timeout: 5000 });

      // 点击侧边栏中的第一个文件
      const firstFileItem = page.locator('.files li').first();
      await firstFileItem.click();

      // 等待文件加载和文件名显示
      await expect(page.locator('.file-info .filename')).toBeVisible({ timeout: 5000 });
      const filename = await page.locator('.file-info .filename').textContent();
      expect(filename).toMatch(/\.md$/);
    });
  });
});