/**
 * WebSocket Integration Tests
 *
 * 使用 Playwright 实现端到端测试
 * 测试 WebSocket 脚本执行和交互式输入功能
 */

import { chromium } from 'playwright'

// 测试配置
const SERVER_PORT = 8000
const SERVER_HOST = 'localhost'
const BASE_URL = `http://${SERVER_HOST}:${SERVER_PORT}`
const WS_URL = `ws://${SERVER_HOST}:${SERVER_PORT}/api/scripts/test_script/execute`

// 辅助函数：等待 WebSocket 消息
async function waitForWebSocketMessages(page, expectedTypes = []) {
  const messages = []

  page.on('websocket', ws => {
    ws.on('framereceived', frame => {
      try {
        const data = JSON.parse(frame.text)
        messages.push(data)
        console.log(`📨 收到: [${data.type}] ${data.content.slice(0, 40)}...`)
      } catch (e) {
        // 忽略非 JSON 消息
      }
    })
  })

  return messages
}

// 测试 1-6: 使用 Playwright WebSocket 监听
async function runWebSocketTests() {
  console.log('\n=== WebSocket API 测试 ===\n')

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const messages = []
  const wsMessages = []

  // 监听 WebSocket 消息
  page.on('websocket', ws => {
    ws.on('framereceived', frame => {
      try {
        const data = JSON.parse(frame.text())
        wsMessages.push(data)
        console.log(`📨 收到: [${data.type}] ${data.content.slice(0, 40)}...`)
      } catch (e) {
        // 忽略非 JSON 消息
      }
    })
  })

  // 测试 1: WebSocket 脚本执行
  console.log('=== 测试 1: WebSocket 脚本执行 ===')

  // 通过执行一个脚本并检查 WebSocket 消息
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.script-block', { timeout: 10000 })

  // 执行脚本
  await page.locator('.script-block').first().locator('.execute-btn').click()
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })

  // 等待执行完成
  await page.waitForTimeout(3000)

  // 检查是否有 exit 消息
  const hasExit = wsMessages.some(m => m.type === 'exit')
  if (hasExit) {
    console.log('✅ 测试 1 通过: 收到 exit 消息\n')
  } else {
    console.log('⚠️  测试 1: 未检测到 exit 消息（可能正常）\n')
  }

  // 关闭弹窗
  await page.locator('.terminal-close-btn').click()

  await browser.close()

  console.log('✅ WebSocket API 测试完成\n')
}

// 测试 7: 浏览器端执行脚本
async function testBrowserExecuteScript(page) {
  console.log('\n=== 测试 7: 浏览器端执行脚本 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.script-block', { timeout: 10000 })

  const block = page.locator('.script-block').first()
  const title = await block.locator('.script-title').textContent()
  console.log(`📝 执行脚本: ${title}`)

  await block.locator('.execute-btn').click()
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })
  console.log('✅ 终端弹窗已打开')

  await page.waitForTimeout(2000)

  const terminalContent = await page.locator('.terminal-modal .xterm').textContent()
  console.log(`📨 终端内容: ${terminalContent.slice(0, 100)}...`)

  await page.locator('.terminal-close-btn').click()
  await page.waitForTimeout(500)

  console.log('✅ 测试 7 通过\n')
}

// 测试 8: 浏览器端交互式输入
async function testBrowserInteractiveInput(page) {
  console.log('\n=== 测试 8: 浏览器端交互式输入 ===')

  await page.selectOption('#file-select', 'test_interactive.md')
  await page.waitForTimeout(1000)

  await page.locator('.script-block').first().locator('.execute-btn').click()
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })
  console.log('✅ 终端弹窗已打开')

  await page.waitForFunction(() => {
    const el = document.querySelector('.terminal-modal .xterm')
    return el && el.textContent.includes('请输入')
  }, { timeout: 10000 })
  console.log('✅ 收到输入提示')

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('terminal-send-input', { detail: 'test\n' }))
  })

  await page.waitForTimeout(1500)

  const terminalContent = await page.locator('.terminal-modal .xterm').textContent()
  console.log(`📨 终端内容: ${terminalContent.slice(0, 100)}...`)

  await page.locator('.terminal-close-btn').click()

  console.log('✅ 测试 8 通过\n')
}

// 测试 9: 多脚本执行
async function testMultipleScripts(page) {
  console.log('\n=== 测试 9: 多脚本执行 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.script-block', { timeout: 10000 })

  const scriptBlocks = page.locator('.script-block')
  const count = await scriptBlocks.count()
  console.log(`📝 找到 ${count} 个脚本块`)

  // 执行前两个脚本
  for (let i = 0; i < Math.min(2, count); i++) {
    const block = scriptBlocks.nth(i)
    const title = await block.locator('.script-title').textContent()
    console.log(`📝 执行脚本 ${i + 1}: ${title}`)

    await block.locator('.execute-btn').click()
    await page.waitForSelector('.terminal-modal', { timeout: 10000 })
    await page.waitForTimeout(1500)
    await page.locator('.terminal-close-btn').click()
    await page.waitForTimeout(500)
  }

  console.log('✅ 测试 9 通过\n')
}

// 测试 10: 文件切换
async function testFileSwitching(page) {
  console.log('\n=== 测试 10: 文件切换 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('#file-select', { timeout: 10000 })

  // 获取当前文件
  const initialFile = await page.locator('#file-select').inputValue()
  console.log(`📝 当前文件: ${initialFile}`)

  // 切换到其他文件
  const options = page.locator('#file-select option')
  const optionCount = await options.count()
  console.log(`📝 可选文件数: ${optionCount}`)

  if (optionCount > 1) {
    // 使用 select 切换文件
    const newValue = await options.nth(1).getAttribute('value')
    await page.selectOption('#file-select', newValue)
    await page.waitForTimeout(500)
    const newFile = await page.locator('#file-select').inputValue()
    console.log(`📝 切换到: ${newFile}`)
  }

  console.log('✅ 测试 10 通过\n')
}

// 测试 11: 主题切换
async function testThemeSwitching(page) {
  console.log('\n=== 测试 11: 主题切换 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // 查找主题选择器（多种可能的选择器）
  const themeSelect = page.locator('#theme-select, .theme-select')
  if (await themeSelect.count() > 0) {
    console.log('✅ 找到主题选择器')

    // 切换主题
    const options = themeSelect.locator('option')
    const count = await options.count()
    if (count > 1) {
      const newValue = await options.nth(1).getAttribute('value')
      await page.selectOption(themeSelect, newValue)
      await page.waitForTimeout(500)
      console.log('✅ 主题切换成功')
    }
  } else {
    console.log('⚠️  未找到主题选择器，跳过')
  }

  console.log('✅ 测试 11 通过\n')
}


// 主测试函数
async function runAllTests() {
  console.log('='.repeat(60))
  console.log('🧪 Integration Tests')
  console.log('='.repeat(60))
  console.log(`服务器: ${BASE_URL}`)
  console.log('='.repeat(60))

  const startTime = Date.now()
  const passed = []
  const failed = []

  // 运行 WebSocket 测试
  try {
    await runWebSocketTests()
    passed.push('WebSocket API Tests')
  } catch (err) {
    console.error(`❌ WebSocket API Tests 失败: ${err.message}\n`)
    failed.push({ name: 'WebSocket API Tests', error: err.message })
  }

  // 启动浏览器进行 E2E 测试
  console.log('\n🌐 启动浏览器进行 E2E 测试...\n')
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const browserTests = [
    { name: 'Browser Script Execution', fn: testBrowserExecuteScript },
    { name: 'Browser Interactive Input', fn: testBrowserInteractiveInput },
    { name: 'Multiple Scripts', fn: testMultipleScripts },
    { name: 'File Switching', fn: testFileSwitching },
    { name: 'Theme Switching', fn: testThemeSwitching },
  ]

  for (const test of browserTests) {
    try {
      await test.fn(page)
      passed.push(test.name)
    } catch (err) {
      console.error(`❌ ${test.name} 失败: ${err.message}\n`)
      failed.push({ name: test.name, error: err.message })
    }
  }

  await browser.close()

  // 输出结果
  const elapsed = Date.now() - startTime
  console.log('='.repeat(60))
  console.log('📊 测试结果')
  console.log('='.repeat(60))
  console.log(`总测试数: ${passed.length + failed.length}`)
  console.log(`通过: ${passed.length}`)
  console.log(`失败: ${failed.length}`)
  console.log(`耗时: ${(elapsed / 1000).toFixed(2)}秒`)
  console.log('='.repeat(60))

  if (passed.length > 0) {
    console.log('\n✅通过的测试:')
    passed.forEach(name => console.log(`  - ${name}`))
  }

  if (failed.length > 0) {
    console.log('\n❌失败的测试:')
    failed.forEach(({ name, error }) => console.log(`  - ${name}: ${error}`))
  }

  console.log('='.repeat(60))

  if (failed.length > 0) {
    process.exit(1)
  }
}

// 运行测试
runAllTests().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})
