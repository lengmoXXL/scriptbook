import { chromium } from 'playwright';

const BASE_URL = 'http://localhost:8000';

async function testTerminal() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    // Show all console logs for debugging
    console.log('[CONSOLE]', text);
  });

  page.on('request', request => {
    if (request.url().includes('/api/scripts/')) {
      console.log('[REQUEST]', request.url());
    }
  });

  page.on('response', response => {
    if (response.url().includes('/api/scripts/')) {
      console.log('[RESPONSE]', response.url(), response.status());
    }
  });

  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('.script-block', { timeout: 10000 });

  // 执行 script_0 (ls -la /tmp) 产生多行输出
  console.log('执行脚本产生多行输出...');
  await page.evaluate(() => {
    window.executeScript('script_0');
  });

  // Wait a bit for WebSocket to establish and messages to be received
  console.log('等待脚本执行...');
  await page.waitForTimeout(5000);

  // Check buffer state
  const bufferState = await page.evaluate(() => {
    return {
      scriptOutputBuffers: window.scriptOutputBuffers,
      keys: Object.keys(window.scriptOutputBuffers || {})
    };
  });
  console.log('Buffer state:', JSON.stringify(bufferState, null, 2));

  // Now wait for button to be enabled
  await page.waitForFunction(() => {
    const btn = document.querySelector('.script-block .result-btn');
    return btn && !btn.disabled;
  }, { timeout: 30000 });

  console.log('执行完成，点击结果按钮...');
  await page.evaluate(() => {
    window.showTerminal('script_0');
  });
  await page.waitForSelector('.terminal-modal', { timeout: 10000 });

  // Take a screenshot to see the actual output
  console.log('截取终端截图...');
  await page.screenshot({ path: '/Users/lzy/Desktop/PROJECTS/web/terminal-large-output.png', fullPage: true });

  // Wait for terminal rendering
  await page.waitForTimeout(2000);

  // Also wait a bit more for xterm.js to render
  await page.waitForTimeout(1000);

  // Check the actual terminal rows
  const terminalInfo = await page.evaluate(() => {
    const xtermEl = document.querySelector('.terminal-modal .xterm');
    const rows = document.querySelectorAll('.terminal-modal .xterm-rows .xterm-row');
    const rowContents = Array.from(rows).map(row => row.textContent);

    // Get the terminal instance to check internal buffer
    const container = document.querySelector('.terminal-modal .terminal-container');
    const terminalId = container?.getAttribute('data-terminal-id');
    const term = terminalId ? window[terminalId] : null;

    return {
      xtermInnerText: xtermEl?.innerText?.slice(0, 200),
      rowCount: rows.length,
      firstFewRows: rowContents.slice(0, 5),
      terminalRows: term?.rows,
      terminalBufferLength: term?._buffer?.lines?.length
    };
  });
  console.log('终端行数:', terminalInfo.rowCount);
  console.log('终端 rows 属性:', terminalInfo.terminalRows);
  console.log('终端缓冲区行数:', terminalInfo.bufferLength);
  console.log('前几行内容:', terminalInfo.firstFewRows);

  await browser.close();
}

testTerminal().catch(console.error);
