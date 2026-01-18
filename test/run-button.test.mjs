/**
 * Run Button Test
 *
 * 测试点击 run 按钮后终端弹窗的内容是否符合预期
 */

import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const SERVER_URL = 'http://localhost:8000'

// 脚本配置：定义每个脚本类型的预期输出
const scriptConfigs = {
  'bash脚本': {
    expectedOutputs: [
      '当前目录文件列表：',  // bash 脚本应该输出当前目录文件列表
      'total'              // ls -la 输出应该包含 total
    ]
  },
  'Python脚本': {
    expectedOutputs: [
      'Python'  // Python 脚本应该输出 Python
    ]
  }
}

async function testRunButtonTerminalContent() {
  console.log('=== Run Button Terminal Content Test ===\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()

  try {
    // 访问页面
    console.log('访问页面...')
    await page.goto(SERVER_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.script-block', { timeout: 10000 })

    // 获取第一个脚本块
    const firstBlock = page.locator('.script-block').first()
    const title = await firstBlock.locator('.script-title').textContent().then(t => t?.trim())
    console.log(`测试脚本: ${title}`)

    // 点击 run 按钮
    console.log('点击 run 按钮...')
    await firstBlock.locator('.execute-btn').click()

    // 等待终端弹窗自动打开
    console.log('等待终端弹窗打开...')
    await page.waitForSelector('.terminal-modal', { timeout: 10000 })
    console.log('✓ 终端弹窗已打开')

    // 等待终端容器渲染
    await expect(page.locator('.terminal-modal .terminal-container')).toBeVisible({ timeout: 10000 })
    console.log('✓ 终端容器已创建')

    // 等待脚本执行完成
    console.log('等待脚本执行完成...')
    // 使用轮询方式检查状态
    let retries = 0
    const maxRetries = 60  // 最多等待 60 秒
    while (retries < maxRetries) {
      const status = await firstBlock.locator('.result-btn').getAttribute('data-status')
      console.log(`  当前按钮状态: ${status} (${retries + 1}/${maxRetries})`)
      if (status === 'completed' || status === 'failed') {
        console.log('✓ 脚本执行完成')
        break
      }
      await page.waitForTimeout(1000)
      retries++
    }

    const finalStatus = await firstBlock.locator('.result-btn').getAttribute('data-status')
    console.log(`  最终状态: ${finalStatus}`)

    if (finalStatus !== 'completed' && finalStatus !== 'failed') {
      throw new Error(`脚本执行超时，最终状态: ${finalStatus}`)
    }

    // 额外等待 2 秒，确保所有输出都已显示
    await page.waitForTimeout(2000)

    // 等待终端有内容
    await page.waitForFunction(() => {
      const container = document.querySelector('.terminal-modal .terminal-container')
      if (!container) return false
      const terminalId = container.getAttribute('data-terminal-id')
      const term = window[terminalId]
      if (!term || !term.buffer || !term.buffer.active) return false
      const buffer = term.buffer.active
      return buffer.length > 0
    }, { timeout: 10000 })
    console.log('✓ 终端已显示内容')

    // 使用 xterm.js API 获取终端内容
    const terminalContent = await page.evaluate(() => {
      const container = document.querySelector('.terminal-modal .terminal-container')
      if (!container) return ''

      const terminalId = container.getAttribute('data-terminal-id')
      if (!terminalId) return ''

      const term = window[terminalId]
      if (!term || !term.buffer || !term.buffer.active) return ''

      const buffer = term.buffer.active
      let text = ''
      for (let i = 0; i < buffer.length; i++) {
        text += buffer.getLine(i)?.translateToString(true) || ''
      }
      return text
    })

    console.log('\n--- 终端内容 ---')
    console.log(terminalContent)
    console.log('--- 终端内容结束 ---\n')

    // 验证终端内容不为空
    if (terminalContent.length === 0) {
      throw new Error('终端内容为空')
    }
    console.log('✓ 终端内容不为空')

    // 根据脚本类型验证具体的输出内容
    const config = scriptConfigs[title]
    if (config && config.expectedOutputs) {
      console.log('验证预期输出内容...')
      console.log(`  配置的预期输出: ${JSON.stringify(config.expectedOutputs)}`)
      let allMatched = true
      for (const expected of config.expectedOutputs) {
        if (terminalContent.includes(expected)) {
          console.log(`  ✓ 找到预期输出: "${expected}"`)
        } else {
          console.log(`  ✗ 未找到预期输出: "${expected}"`)
          allMatched = false
        }
      }

      if (!allMatched) {
        throw new Error(`脚本 "${title}" 的输出不符合预期`)
      }
      console.log('✓ 所有预期输出都存在')
    } else {
      console.log(`⚠️  未配置该脚本 "${title}" 的预期输出，跳过内容验证`)
    }

    // 验证 terminal 按钮状态
    const resultBtn = firstBlock.locator('.result-btn')
    const resultBtnStatus = await resultBtn.getAttribute('data-status')
    const resultBtnText = await resultBtn.textContent()

    console.log(`Terminal 按钮状态: ${resultBtnStatus}`)
    console.log(`Terminal 按钮文本: ${resultBtnText}`)

    if (resultBtnStatus !== 'completed') {
      throw new Error(`Terminal 按钮状态不正确: 期望 completed，实际 ${resultBtnStatus}`)
    }
    console.log('✓ Terminal 按钮状态正确')

    if (!resultBtnText.includes('terminal')) {
      throw new Error(`Terminal 按钮文本不正确: ${resultBtnText}`)
    }
    console.log('✓ Terminal 按钮文本正确')

    // 关闭弹窗
    await page.locator('.terminal-close-btn').click()
    await page.waitForTimeout(500)
    console.log('✓ 弹窗已关闭')

    console.log('\n✅ 测试通过')

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

// 运行测试
testRunButtonTerminalContent().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})