import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'http://localhost:7771';

test.describe('分栏功能测试', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    // 等待页面加载完成（显示空状态提示）
    await expect(page.locator('.empty-state')).toBeVisible({ timeout: 10000 });
  });

  async function openFirstMarkdownFile(page) {
    // 使用 Ctrl+P 打开快速搜索
    await page.keyboard.press('Control+p');
    await expect(page.locator('.quick-open-dialog')).toBeVisible({ timeout: 5000 });

    // 等待文件列表加载，选择第一个 .md 文件
    const mdFile = page.locator('.quick-open-item').filter({ hasText: '.md' }).first();
    await mdFile.click();

    // 等待窗口出现
    const windows = page.locator('.window');
    await expect(windows.first()).toBeVisible({ timeout: 5000 });
    return windows;
  }

  async function splitWindow(page, direction) {
    // 右键点击窗口打开菜单
    const window = page.locator('.window').first();
    await window.click({ button: 'right' });

    // 等待右键菜单出现
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 2000 });

    // 点击分割按钮
    if (direction === 'horizontal') {
      await contextMenu.locator('.context-menu-item').filter({ hasText: 'Split Right' }).click();
    } else {
      await contextMenu.locator('.context-menu-item').filter({ hasText: 'Split Down' }).click();
    }
  }

  async function closeWindow(page, index = 0) {
    // 右键点击指定窗口打开菜单
    const window = page.locator('.window').nth(index);
    await window.click({ button: 'right' });

    // 等待右键菜单出现
    const contextMenu = page.locator('.context-menu');
    await expect(contextMenu).toBeVisible({ timeout: 2000 });

    // 点击关闭按钮
    await contextMenu.locator('.context-menu-item').filter({ hasText: 'Close' }).click();
  }

  test('点击水平分栏按钮应该从 1 栏变成 2 栏', async ({ page }) => {
    const windows = await openFirstMarkdownFile(page);
    expect(await windows.count()).toBe(1);

    // 通过右键菜单分栏
    await splitWindow(page, 'horizontal');

    // 应该变成 2 个窗口
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);
  });

  test('点击垂直分栏按钮应该从 1 栏变成 2 栏', async ({ page }) => {
    const windows = await openFirstMarkdownFile(page);
    expect(await windows.count()).toBe(1);

    // 通过右键菜单分栏
    await splitWindow(page, 'vertical');

    // 应该变成 2 个窗口
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);
  });

  test('多次分栏应该正确累加', async ({ page }) => {
    const windows = await openFirstMarkdownFile(page);
    expect(await windows.count()).toBe(1);

    // 第一次分栏
    await splitWindow(page, 'horizontal');
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);

    // 第二次分栏（点击第一个窗口）
    await splitWindow(page, 'horizontal');
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(3);
  });

  test('关闭窗口应该正确减少窗口数', async ({ page }) => {
    const windows = await openFirstMarkdownFile(page);

    // 分栏
    await splitWindow(page, 'horizontal');
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(2);

    // 关闭第一个窗口
    await closeWindow(page, 0);
    await page.waitForTimeout(300);
    expect(await windows.count()).toBe(1);
  });
});
