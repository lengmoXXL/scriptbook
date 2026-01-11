import { chromium } from 'playwright'
import { expect } from '@playwright/test'

async function testAllScripts() {
  console.log('启动浏览器...')
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // 收集控制台消息
  const consoleMessages = []
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() })
  })

  try {
    console.log('打开页面...')
    await page.goto('http://localhost:8000', { waitUntil: 'networkidle' })

    // 选择测试文件
    console.log('选择测试文件...')
    await page.selectOption('#file-select', 'test_interactive.md')

    // 等待脚本块出现
    console.log('等待脚本块渲染...')
    await page.waitForSelector('.script-block', { timeout: 10000 })
    await page.waitForTimeout(1500) // 额外等待终端初始化

    // 获取所有脚本块
    const scriptBlocks = page.locator('.script-block')
    const count = await scriptBlocks.count()
    console.log(`找到 ${count} 个脚本块`)

    // 遍历执行每个脚本
    for (let i = 0; i < count; i++) {
      const block = scriptBlocks.nth(i)
      const title = await block.locator('.script-title').textContent()
      console.log(`\n--- 执行脚本 ${i + 1}: ${title} ---`)

      // 点击执行
      await block.locator('.execute-btn').click()
      await page.waitForTimeout(2000)

      // 等待终端
      const terminal = block.locator('.xterm')
      await expect(terminal).toBeVisible({ timeout: 10000 })
      console.log('✓ 终端已创建')

      // 检查是否有输入框（交互式脚本）
      const inputContainer = block.locator('.script-input-container')
      const isInputVisible = await inputContainer.isVisible().catch(() => false)

      if (isInputVisible) {
        console.log('✓ 检测到交互式输入')

        // 根据脚本类型输入内容
        let inputValue = 'test'
        if (title.includes('多行')) {
          inputValue = 'line1'
          await inputContainer.locator('.script-input').fill(inputValue)
          await inputContainer.locator('.input-send-btn').click()
          await page.waitForTimeout(500)

          await inputContainer.locator('.script-input').fill('line2')
          await inputContainer.locator('.input-send-btn').click()
          await page.waitForTimeout(500)

          await inputContainer.locator('.script-input').fill('end')
          await inputContainer.locator('.input-send-btn').click()
          console.log('✓ 多行输入已发送')
        } else if (title.includes('密码')) {
          // 密码输入不验证
          await inputContainer.locator('.script-input').fill('mypassword')
          await inputContainer.locator('.input-send-btn').click()
          console.log('✓ 密码已发送')
        } else {
          // 普通输入
          await inputContainer.locator('.script-input').fill(inputValue)
          await inputContainer.locator('.input-send-btn').click()
          console.log('✓ 输入已发送')
        }

        // 等待脚本结束
        await page.waitForTimeout(2000)
      }

      // 检查是否需要停止（stopBtn 可见且可用）
      const stopBtn = block.locator('.stop-btn')
      const isStopVisible = await stopBtn.isVisible().catch(() => false)
      const isStopDisabled = await stopBtn.isDisabled().catch(() => true)
      if (isStopVisible && !isStopDisabled) {
        await stopBtn.click()
        console.log('✓ 脚本已停止')
      }

      // 等待一小会儿再执行下一个
      await page.waitForTimeout(500)
    }

    console.log('\n✅ 所有脚本测试通过！')
  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)

    // 打印控制台日志
    console.log('\n--- 控制台日志 ---')
    consoleMessages.forEach(msg => {
      if (msg.type === 'error' || msg.type === 'log') {
        console.log(`[${msg.type}] ${msg.text}`)
      }
    })

    process.exit(1)
  } finally {
    await browser.close()
  }
}

testAllScripts()
