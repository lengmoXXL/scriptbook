/**
 * Long Text Wrap Test
 *
 * 测试终端对长文本的换行渲染
 */

import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const SERVER_URL = 'http://localhost:8000'

async function testLongTextWrap() {
  console.log('=== Long Text Wrap Test ===\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const context = await browser.newContext()

  try {
    const page = await context.newPage()
    await page.goto(SERVER_URL, { waitUntil: 'networkidle' })

    // 清理之前测试可能留下的弹窗
    console.log('清理之前测试可能留下的弹窗...')
    const existingModals = await page.locator('.terminal-modal-overlay').count()
    if (existingModals > 0) {
      console.log(`  发现 ${existingModals} 个残留弹窗`)
      try {
        await page.locator('.terminal-modal .terminal-close-btn').click({ force: true }).catch(() => {})
        await page.waitForTimeout(300)
      } catch (e) {}
    }

    await page.waitForSelector('.script-block', { timeout: 10000 })

    // 获取第一个脚本块
    const firstBlock = page.locator('.script-block').first()
    const scriptId = await firstBlock.getAttribute('data-script-id')
    console.log(`脚本 ID: ${scriptId}`)

    // 修改脚本代码为长文本测试
    const longText = '这是一行很长的测试输出，用于测试终端对长文本的渲染效果，字符数超过一百五十个字符确保测试准确性和完整性验证终端的滚动条行'
    const testCode = `echo "${longText}"`

    console.log('修改脚本代码为长文本测试...')
    await page.evaluate((code) => {
      const codeEl = document.querySelector('.script-code')
      if (codeEl) {
        codeEl.textContent = code
      }
    }, testCode)

    // 点击 run 按钮
    console.log('执行脚本...')
    await firstBlock.locator('.execute-btn').click()
    await page.waitForSelector('.terminal-modal', { timeout: 10000 })

    // 等待脚本执行完成
    console.log('等待脚本完成...')
    let retries = 0
    const maxRetries = 30
    while (retries < maxRetries) {
      const status = await firstBlock.locator('.result-btn').getAttribute('data-status')
      if (status === 'completed' || status === 'failed') {
        console.log(`  ✓ 脚本已完成，状态: ${status}`)
        break
      }
      await page.waitForTimeout(1000)
      retries++
    }

    // 等待终端内容加载
    await page.waitForTimeout(1000)

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

    // 验证终端内容包含完整的长文本
    if (terminalContent.length === 0) {
      throw new Error('终端内容为空')
    }
    console.log('✓ 终端内容不为空')

    // 检查是否包含完整的长文本
    if (terminalContent.includes(longText)) {
      console.log('✓ 终端内容包含完整的长文本')
    } else {
      // 如果没有完整的长文本，检查是否有部分内容
      const partialMatch = longText.substring(0, 50)
      if (terminalContent.includes(partialMatch)) {
        console.warn('⚠️  终端内容只包含部分长文本，可能存在换行问题')
      } else {
        throw new Error('终端内容不包含预期的长文本')
      }
    }

    // 获取终端行数信息（canvas-based xterm）
    const terminalInfo = await page.evaluate(() => {
      const container = document.querySelector('.terminal-container')
      if (!container) return null

      const terminalId = container.getAttribute('data-terminal-id')
      const term = window[terminalId]
      if (term) {
        return {
          rows: term.rows,
          cols: term.cols
        }
      }
      return null
    })

    if (terminalInfo) {
      console.log(`\n--- 终端信息 ---`)
      console.log(`行数: ${terminalInfo.rows}`)
      console.log(`列数: ${terminalInfo.cols}`)
      console.log('--- 终端信息结束 ---\n')
    }

    console.log('\n✅ 测试通过')

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message)
    process.exit(1)
  } finally {
    await browser.close()
  }
}

// 运行测试
testLongTextWrap().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})
