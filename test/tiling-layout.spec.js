import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:7771';

test.describe('分栏功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.locator('.file-list')).toBeVisible({ timeout: 10000 });
  });

  test('点击水平分栏按钮应该从 1 栏变成 2 栏', async ({ page }) => {
    // 打开一个 markdown 文件
    const mdFile = page.locator('.files li').filter({ hasText: '.md' }).first();
    await mdFile.click();

    // 等待窗口出现
    const windows = page.locator('.window');
    await expect(windows.first()).toBeVisible({ timeout: 5000 });
    expect(await windows.count()).toBe(1);

    // 点击水平分栏按钮
    const splitHBtn = windows.first().locator('.window-action-btn').first();
    await splitHBtn.click();

    // 应该变成 2 个窗口
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);
  });

  test('点击垂直分栏按钮应该从 1 栏变成 2 栏', async ({ page }) => {
    // 打开一个 markdown 文件
    const mdFile = page.locator('.files li').filter({ hasText: '.md' }).first();
    await mdFile.click();

    const windows = page.locator('.window');
    await expect(windows.first()).toBeVisible({ timeout: 5000 });
    expect(await windows.count()).toBe(1);

    // 点击垂直分栏按钮（第二个按钮）
    const splitVBtn = windows.first().locator('.window-action-btn').nth(1);
    await splitVBtn.click();

    // 应该变成 2 个窗口
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);
  });

  test('多次分栏应该正确累加', async ({ page }) => {
    // 打开一个 markdown 文件
    const mdFile = page.locator('.files li').filter({ hasText: '.md' }).first();
    await mdFile.click();

    const windows = page.locator('.window');
    await expect(windows.first()).toBeVisible({ timeout: 5000 });
    expect(await windows.count()).toBe(1);

    // 第一次分栏
    const splitHBtn = windows.first().locator('.window-action-btn').first();
    await splitHBtn.click();
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);

    // 第二次分栏（点击第一个窗口）
    await windows.first().locator('.window-action-btn').first().click();
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(3);
  });

  test('关闭窗口应该正确减少窗口数', async ({ page }) => {
    // 打开一个 markdown 文件
    const mdFile = page.locator('.files li').filter({ hasText: '.md' }).first();
    await mdFile.click();

    const windows = page.locator('.window');
    await expect(windows.first()).toBeVisible({ timeout: 5000 });

    // 分栏
    const splitHBtn = windows.first().locator('.window-action-btn').first();
    await splitHBtn.click();
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);

    // 关闭第一个窗口
    await windows.first().locator('.window-close').click();
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(1);
  });
});
