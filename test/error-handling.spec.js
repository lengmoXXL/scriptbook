import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:7771';

test.describe('错误处理测试', () => {
  test('文件列表加载失败时应该显示错误横幅', async ({ page }) => {
    await page.route('**/api/files', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto(FRONTEND_URL);

    const errorBanner = page.locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
    await expect(errorBanner).toContainText('获取文件列表失败');
  });

  test('错误横幅样式正确', async ({ page }) => {
    await page.route('**/api/files', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto(FRONTEND_URL);

    const errorBanner = page.locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    await expect(errorBanner).toHaveCSS('position', 'fixed');
    await expect(errorBanner).toHaveCSS('top', '0px');
    await expect(errorBanner).toHaveCSS('z-index', '9999');
    await expect(errorBanner).toHaveCSS('background-color', 'rgb(185, 28, 28)');
  });

  test('点击关闭按钮应该隐藏错误横幅', async ({ page }) => {
    await page.route('**/api/files', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto(FRONTEND_URL);

    const errorBanner = page.locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    const closeBtn = errorBanner.locator('.error-banner-close');
    await closeBtn.click();

    await expect(errorBanner).toBeHidden({ timeout: 1000 });
  });

  test('点击错误横幅区域应该隐藏它', async ({ page }) => {
    await page.route('**/api/files', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto(FRONTEND_URL);

    const errorBanner = page.locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    // 点击消息区域（不是关闭按钮）
    const messageArea = errorBanner.locator('.error-banner-message');
    await messageArea.click();

    await expect(errorBanner).toBeHidden({ timeout: 1000 });
  });

  test('错误横幅应该在 5 秒后自动隐藏', async ({ page }) => {
    await page.route('**/api/files', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await page.goto(FRONTEND_URL);

    const errorBanner = page.locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });

    // 等待自动消失（默认 5000ms）
    await expect(errorBanner).toBeHidden({ timeout: 7000 });
  });
});
