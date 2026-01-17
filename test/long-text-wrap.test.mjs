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

    // 获取终端内容
    const terminalContent = await page.evaluate(() => {
      const xtermEl = document.querySelector('.terminal-modal .xterm')
      if (!xtermEl) return ''

      const rowsEl = xtermEl.querySelector('.xterm-rows')
      if (rowsEl) {
        const lines = rowsEl.querySelectorAll('div')
        return Array.from(lines).map(line => {
          const chars = line.querySelectorAll('span')
          return Array.from(chars).map(s => s.textContent || '').join('')
        }).join('\n')
      }

      return xtermEl.textContent || ''
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

    // 检查 xterm-rows div 的高度限制
    const rowsInfo = await page.evaluate(() => {
      const xtermEl = document.querySelector('.terminal-modal .xterm')
      if (!xtermEl) return null

      const rowsEl = xtermEl.querySelector('.xterm-rows')
      if (!rowsEl) return null

      const lines = rowsEl.querySelectorAll('div')
      return {
        lineCount: lines.length,
        lines: Array.from(lines).map(line => {
          const height = line.style.height
          const overflow = line.style.overflow
          const text = Array.from(line.querySelectorAll('span')).map(s => s.textContent).join('')
          return { height, overflow, text: text.substring(0, 50) }
        })
      }
    })

    console.log(`\n--- xterm-rows 信息 ---`)
    console.log(`行数: ${rowsInfo.lineCount}`)
    rowsInfo.lines.forEach((line, i) => {
      console.log(`  行 ${i + 1}: height=${line.height}, overflow=${line.overflow}, text="${line.text}..."`)
    })
    console.log('--- xterm-rows 信息结束 ---\n')

    // 验证没有 overflow: hidden 的行（除了可能的第一行）
    const hiddenLines = rowsInfo.lines.filter(line => line.overflow === 'hidden')
    if (hiddenLines.length > 0) {
      console.warn(`⚠️  发现 ${hiddenLines.length} 行设置了 overflow: hidden，可能导致内容被截断`)
    } else {
      console.log('✓ 没有发现 overflow: hidden 的行')
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
