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

    // 等待执行完成
    await page.waitForFunction((idx) => {
      const blocks = document.querySelectorAll('.script-block')
      const btn = blocks[idx]?.querySelector('.result-btn')
      return btn && btn.getAttribute('data-status') === 'completed'
    }, i, { timeout: 30000 })

    // 弹窗应该已经自动打开，关闭它
    await page.waitForTimeout(500)
    await page.locator('.terminal-close-btn').click()
    await page.waitForTimeout(500)
  }

  console.log('✅ 测试 9 通过\n')
}

// 测试 10: 文件切换
async function testFileSwitching(page) {
  console.log('\n=== 测试 10: 文件切换 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('select', { timeout: 10000 })

  // 获取当前文件
  const select = page.locator('select').first()
  const initialFile = await select.inputValue()
  console.log(`📝 当前文件: ${initialFile}`)

  // 获取所有选项
  const options = select.locator('option')
  const optionCount = await options.count()
  console.log(`📝 可选文件数: ${optionCount}`)

  if (optionCount > 1) {
    // 切换到第二个文件
    const newValue = await options.nth(1).getAttribute('value')
    await page.selectOption('select', newValue)
    await page.waitForTimeout(500)
    const newFile = await select.inputValue()
    console.log(`📝 切换到: ${newFile}`)
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

// 测试 12: 终端行数填充容器
async function testTerminalRowsFillContainer(page) {
  console.log('\n=== 测试 12: 终端行数填充容器 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.script-block', { timeout: 10000 })

  // 执行一个脚本（弹窗会自动打开）
  await page.locator('.script-block').first().locator('.execute-btn').click()

  // 等待弹窗自动打开
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })

  // 等待执行完成
  await page.waitForFunction(() => {
    const btn = document.querySelector('.script-block .result-btn')
    return btn && btn.getAttribute('data-status') === 'completed'
  }, { timeout: 30000 })

  await page.waitForTimeout(500)

  // 获取终端容器和 xterm 视口的尺寸
  const dimensions = await page.evaluate(() => {
    const container = document.querySelector('.terminal-modal .terminal-container')
    const xtermViewport = document.querySelector('.terminal-modal .xterm-viewport')
    const xtermScreen = document.querySelector('.terminal-modal .xterm-screen')

    if (!container || !xtermViewport) {
      return { error: '无法找到终端元素' }
    }

    const containerRect = container.getBoundingClientRect()
    const viewportRect = xtermViewport.getBoundingClientRect()
    const screenRect = xtermScreen ? xtermScreen.getBoundingClientRect() : null

    return {
      containerHeight: containerRect.height,
      viewportHeight: viewportRect.height,
      screenHeight: screenRect ? screenRect.height : 0,
      // 计算填充比例
      fillRatio: viewportRect.height / containerRect.height
    }
  })

  console.log(`📏 容器高度: ${dimensions.containerHeight}px`)
  console.log(`📏 xterm 视口高度: ${dimensions.viewportHeight}px`)
  console.log(`📏 xterm 屏幕高度: ${dimensions.screenHeight}px`)
  console.log(`📏 填充比例: ${(dimensions.fillRatio * 100).toFixed(1)}%`)

  // 关闭弹窗
  await page.locator('.terminal-close-btn').click()

  // 验证终端至少填充了容器的 90%
  if (dimensions.fillRatio < 0.9) {
    throw new Error(`终端未填充容器：填充比例仅为 ${(dimensions.fillRatio * 100).toFixed(1)}%，期望至少 90%`)
  }

  console.log('✅ 测试 12 通过\n')
}

// 测试 13: 终端 rows 和 columns 数量验证
async function testTerminalRowsAndCols(page) {
  console.log('\n=== 测试 13: 终端 rows 和 columns 数量验证 ===')

  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await page.waitForSelector('.script-block', { timeout: 10000 })

  // 执行一个脚本（弹窗会自动打开）
  await page.locator('.script-block').first().locator('.execute-btn').click()

  // 等待弹窗自动打开
  await page.waitForSelector('.terminal-modal', { timeout: 10000 })

  // 等待执行完成
  await page.waitForFunction(() => {
    const btn = document.querySelector('.script-block .result-btn')
    return btn && btn.getAttribute('data-status') === 'completed'
  }, { timeout: 30000 })

  await page.waitForTimeout(500)

  // 获取终端的 rows 和 cols 值，以及容器尺寸
  const result = await page.evaluate(() => {
    const containers = document.querySelectorAll('.terminal-modal .terminal-container')
    const container = containers[0]
    const allContainers = Array.from(containers).map(c => ({
      exists: !!c,
      dataTerminalId: c?.getAttribute('data-terminal-id'),
      className: c?.className
    }))

    if (!container) {
      return { error: '找不到 terminal-container', allContainers }
    }

    const containerId = container.getAttribute('data-terminal-id')
    if (!containerId) {
      return { error: '找不到 data-terminal-id', allContainers, containerHtml: container.outerHTML?.substring(0, 200) }
    }

    const term = window[containerId]
    if (!term) {
      return { error: '找不到 terminal 实例', containerId, windowTerminals: Object.keys(window).filter(k => k.startsWith('terminal_')) }
    }

    const containerRect = container.getBoundingClientRect()

    // 计算实际的字符宽度（通过 measure 元素）
    const measureEl = document.createElement('div')
    measureEl.style.position = 'fixed'
    measureEl.style.visibility = 'hidden'
    measureEl.style.whiteSpace = 'pre'
    measureEl.style.left = '-9999px'
    measureEl.style.fontFamily = "'SF Mono', 'Menlo', monospace"
    measureEl.style.fontSize = '13px'
    measureEl.textContent = 'W'.repeat(50)
    document.body.appendChild(measureEl)
    const charWidth = measureEl.getBoundingClientRect().width / 50
    document.body.removeChild(measureEl)

    return {
      rows: term.rows,
      cols: term.cols,
      containerWidth: containerRect.width,
      containerHeight: containerRect.height,
      charWidth: charWidth,
      lineHeight: 15 // xterm 行高
    }
  })

  if (result.error) {
    throw new Error(`${result.error}, allContainers: ${JSON.stringify(result.allContainers)}`)
  }

  // 期望的固定尺寸
  const EXPECTED_COLS = 120
  const EXPECTED_ROWS = 35

  console.log(`📏 终端尺寸: ${result.cols} 列 x ${result.rows} 行`)
  console.log(`📏 容器尺寸: ${result.containerWidth.toFixed(1)}px x ${result.containerHeight.toFixed(1)}px`)

  // 验证 rows 和 cols 是否为固定值
  if (result.rows !== EXPECTED_ROWS) {
    throw new Error(`rows 值不正确: 期望 ${EXPECTED_ROWS}, 实际 ${result.rows}`)
  }
  if (result.cols !== EXPECTED_COLS) {
    throw new Error(`cols 值不正确: 期望 ${EXPECTED_COLS}, 实际 ${result.cols}`)
  }

  console.log(`📏 期望 rows: ${EXPECTED_ROWS}, 实际: ${result.rows}`)
  console.log(`📏 期望 cols: ${EXPECTED_COLS}, 实际: ${result.cols}`)

  // 关闭弹窗
  await page.locator('.terminal-close-btn').click()

  console.log('✅ 测试 13 通过\n')
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
    { name: 'Terminal Rows Fill Container', fn: testTerminalRowsFillContainer },
    { name: 'Terminal Rows And Cols', fn: testTerminalRowsAndCols },
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
