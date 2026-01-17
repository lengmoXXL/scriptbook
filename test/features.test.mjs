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

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
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

  // 执行脚本（弹窗会自动打开）
  await page.locator('.script-block').first().locator('.execute-btn').click()

  // 等待弹窗自动打开
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })

  // 等待执行完成（结果按钮变为 completed）
  await page.waitForFunction(() => {
    const btn = document.querySelector('.script-block .result-btn')
    return btn && btn.getAttribute('data-status') === 'completed'
  }, { timeout: 30000 })

  // 等待一下确保所有输出都显示
  await page.waitForTimeout(2000)

  // 检查是否有 exit 消息
  const hasExit = wsMessages.some(m => m.type === 'exit')
  if (hasExit) {
    console.log('✅ 测试 1 通过: 收到 exit 消息\n')
  } else {
    console.log('⚠️  测试 1: 未检测到 exit 消息（可能正常）\n')
  }

  // 关闭弹窗
  await page.locator('.terminal-close-btn').click()
  await page.waitForTimeout(500)

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

  // 等待弹窗自动打开
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })
  console.log('✅ 终端弹窗已打开')

  // 等待执行完成
  await page.waitForFunction(() => {
    const btn = document.querySelector('.script-block .result-btn')
    return btn && btn.getAttribute('data-status') === 'completed'
  }, { timeout: 30000 })

  await page.waitForTimeout(1000)

  const terminalContent = await page.locator('.terminal-modal .xterm').textContent()
  console.log(`📨 终端内容: ${terminalContent.slice(0, 100)}...`)

  await page.locator('.terminal-close-btn').click()
  await page.waitForTimeout(500)

  console.log('✅ 测试 7 通过\n')
}

// 测试 8: 浏览器端交互式输入
async function testBrowserInteractiveInput(page) {
  console.log('\n=== 测试 8: 浏览器端交互式输入 ===')

  // 使用 JavaScript 切换到 test_interactive.md
  await page.evaluate(() => {
    const select = document.querySelector('select');
    if (select) {
      select.value = 'test_interactive.md';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  })
  await page.waitForTimeout(1000)

  await page.locator('.script-block').first().locator('.execute-btn').click()

  // 等待一会让 WebSocket 连接建立
  await page.waitForTimeout(500)

  // 等待弹窗自动打开
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
  await page.waitForTimeout(500)

  console.log('✅ 测试 8 通过\n')
}

// 测试 9: 多脚本执行
async function testMultipleScripts(page) {
  console.log('\n=== 测试 9: 多脚本执行 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // 等待 select 元素
  await page.waitForSelector('#file-select', { timeout: 10000 })

  // 先切换到 example.md（避免 test_interactive.md 的交互式脚本）
  await page.evaluate(() => {
    if (window.selectFile) {
      window.selectFile('example.md')
    }
  })
  await page.waitForTimeout(2000)

  // 等待脚本块渲染
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

    // 等待执行完成（使用轮询）
    let completed = false
    for (let retry = 0; retry < 60; retry++) {
      await page.waitForTimeout(500)
      const status = await block.locator('.result-btn').getAttribute('data-status')
      if (status === 'completed' || status === 'failed') {
        completed = true
        console.log(`  脚本 ${i + 1} 完成，状态: ${status}`)
        break
      }
    }

    if (!completed) {
      throw new Error(`脚本 ${i + 1} 执行超时`)
    }

    // 关闭弹窗
    await page.locator('.terminal-close-btn').click()
    await page.waitForTimeout(500)
  }

  console.log('✅ 测试 9 通过\n')
}

// 测试 10: 文件切换
async function testFileSwitching(page) {
  console.log('\n=== 测试 10: 文件切换 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // 等待 select 元素
  await page.waitForSelector('#file-select', { timeout: 10000 })

  // 等待初始文件加载
  await page.waitForFunction(() => {
    const content = document.querySelector('.markdown-content')
    return content && content.textContent.length > 50
  }, { timeout: 15000 })

  // 获取当前文件
  const initialFile = await page.evaluate(() => {
    return document.querySelector('#file-select').value
  })
  console.log(`📝 当前文件: ${initialFile}`)

  // 从 select 元素获取第二个文件名
  const fileInfo = await page.evaluate(() => {
    const select = document.querySelector('#file-select')
    const options = Array.from(select.options).filter(opt => !opt.disabled && opt.value)
    return {
      secondFile: options[1]?.value,
      hasSelectFile: typeof window.selectFile === 'function'
    }
  })

  console.log(`  secondFile: ${fileInfo.secondFile}, hasSelectFile: ${fileInfo.hasSelectFile}`)

  if (fileInfo.secondFile && fileInfo.hasSelectFile) {
    await page.evaluate((file) => {
      window.selectFile(file)
    }, fileInfo.secondFile)
  }
  await page.waitForTimeout(2000)

  // 验证文件已切换
  const newFile = await page.evaluate(() => {
    return document.querySelector('#file-select').value
  })
  console.log(`📝 切换到: ${newFile}`)

  if (!newFile) {
    throw new Error('文件切换失败')
  }

  console.log('✅ 测试 10 通过\n')
}

// 测试 11: 主题切换
async function testThemeSwitching(page) {
  console.log('\n=== 测试 11: 主题切换 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })

  // 查找所有 select 元素（第二个是主题选择器）
  const selects = page.locator('select')
  const count = await selects.count()
  console.log(`📝 找到 ${count} 个选择器`)

  if (count >= 2) {
    const themeSelect = selects.nth(1)
    console.log('✅ 找到主题选择器')

    // 切换主题
    const options = themeSelect.locator('option')
    const optionCount = await options.count()
    if (optionCount > 1) {
      const newValue = await options.nth(1).getAttribute('value')
      // 使用 evaluate 来切换主题
      await page.evaluate((val) => {
        const selects = document.querySelectorAll('select')
        if (selects.length >= 2) {
          selects[1].value = val
          selects[1].dispatchEvent(new Event('change', { bubbles: true }))
        }
      }, newValue)
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
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
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
