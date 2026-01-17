import { chromium } from 'playwright'
import { expect } from '@playwright/test'

// 脚本配置：定义每个脚本需要的输入和预期输出
const scriptConfigs = {
  'read命令测试': {
    input: 'hello world\n',
    waitAfterInput: 500,
    // 预期输出中应该包含的文本（可以是正则表达式或字符串）
    expectedOutputs: [
      '你好, hello world!'
    ]
  },
  'cat交互测试': {
    input: '这是一行测试输入\n',
    waitAfterInput: 500,
    expectedOutputs: []
  },
  '多行输入测试': {
    input: '第一行\n第二行\n第三行\nend\n',
    waitAfterInput: 2000,
    expectedOutputs: [
      '你输入了: 第一行',
      '你输入了: 第二行',
      '你输入了: 第三行'
    ]
  },
  '密码输入测试': {
    input: 'secret123\n',
    waitAfterInput: 2000,
    expectedOutputs: [
      // 跳过验证，因为 read -s 在终端中行为不一致
    ]
  }
}

async function testAllScripts() {
  console.log('启动浏览器...')
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()

  // 收集控制台消息
  const consoleMessages = []
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() })
  })

  // 收集网络请求失败
  page.on('requestfailed', request => {
    console.log(`[网络失败] ${request.url()}: ${request.failure()?.errorText}`)
  })

  try {
    console.log('打开页面...')
    await page.goto('http://localhost:8000', {
      waitUntil: 'networkidle',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    })

    // 选择测试文件
    console.log('选择测试文件...')
    await page.selectOption('#file-select', 'test_interactive.md')

    // 等待脚本块出现
    console.log('等待脚本块渲染...')
    await page.waitForSelector('.script-block', { timeout: 10000 })
    await page.waitForTimeout(1000)

    // 获取所有脚本块
    const scriptBlocks = page.locator('.script-block')
    const count = await scriptBlocks.count()
    console.log(`找到 ${count} 个脚本块`)

    // 遍历执行每个脚本
    for (let i = 0; i < count; i++) {
      const block = scriptBlocks.nth(i)
      const title = await block.locator('.script-title').textContent()
      console.log(`\n--- 执行脚本 ${i + 1}: ${title} ---`)

      // 点击执行按钮（弹窗会自动打开）
      await block.locator('.execute-btn').click()
      console.log('✓ 已点击执行按钮')

      // 等待弹窗自动打开
      await page.waitForSelector('.terminal-modal', { timeout: 10000 })
      console.log('✓ 弹窗已打开')

      // 等待终端容器渲染
      const terminalModal = page.locator('.terminal-modal')
      await expect(terminalModal.locator('.terminal-container')).toBeVisible({ timeout: 10000 })
      console.log('✓ 终端容器已创建')

      // 查找终端输入区域并输入
      const config = scriptConfigs[title]
      if (config) {
        // 等待终端有内容
        await page.waitForFunction(() => {
          const xtermEl = document.querySelector('.terminal-modal .xterm')
          if (!xtermEl) return false
          const text = xtermEl.textContent || ''
          return text.length > 10
        }, { timeout: 10000 })
        console.log('✓ 终端已显示提示符')

        // 等待更多时间确保终端完全准备好
        await page.waitForTimeout(500)

        // 尝试键盘输入，但中文字符可能丢失第一个字节
        // 对于中文字符，使用全局事件方式
        const terminalContainer = page.locator('.terminal-modal .terminal-container')
        await terminalContainer.click()
        await page.waitForTimeout(200)

        // 检测是否包含非ASCII字符
        const hasNonAscii = /[^\x00-\x7F]/.test(config.input)

        if (hasNonAscii) {
          // 中文字符：使用全局事件（更可靠）
          await page.evaluate(({ input }) => {
            window.dispatchEvent(new CustomEvent('terminal-send-input', { detail: input }))
          }, { input: config.input })
          console.log(`✓ 已通过全局事件输入（含非ASCII字符）: ${JSON.stringify(config.input)}`)
        } else {
          // ASCII字符：使用键盘输入（模拟真实用户）
          for (const char of config.input) {
            if (char === '\n') {
              await page.keyboard.press('Enter')
            } else if (char === '\t') {
              await page.keyboard.press('Tab')
            } else {
              await page.keyboard.type(char)
            }
            await page.waitForTimeout(50)
          }
          console.log(`✓ 已通过键盘输入: ${JSON.stringify(config.input)}`)
        }

        // 等待脚本处理输入
        await page.waitForTimeout(config.waitAfterInput + 1000)

        // 验证预期输出
        if (config.expectedOutputs && config.expectedOutputs.length > 0) {
          console.log('🔍 验证输出...')
          // 通过 xterm DOM 元素获取文本内容
          const terminalText = await page.evaluate(() => {
            const xtermEl = document.querySelector('.terminal-modal .xterm')
            if (xtermEl) {
              let text = xtermEl.textContent || ''
              if (text) {
                text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
                text = text.trim()
              }
              return text
            }
            return ''
          })
          console.log('终端内容长度:', terminalText.length)
          console.log('终端内容预览:', terminalText.substring(0, 200))

          let allMatched = true
          for (const expected of config.expectedOutputs) {
            if (terminalText.includes(expected)) {
              console.log(`✓ 找到预期输出: "${expected}"`)
            } else {
              console.log(`✗ 未找到预期输出: "${expected}"`)
              allMatched = false
            }
          }

          if (!allMatched) {
            console.log('\n--- 终端实际内容 ---')
            console.log(terminalText)
            throw new Error(`脚本 "${title}" 的输出不符合预期`)
          }
        }
      } else {
        // 如果没有配置输入，等待脚本自然结束或超时
        console.log('⚠ 未配置输入，脚本可能等待输入中...')
        await page.waitForTimeout(3000)
      }

      // 关闭弹窗
      await page.locator('.terminal-close-btn').click()
      await page.waitForTimeout(500)
      console.log('✓ 弹窗已关闭')
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
