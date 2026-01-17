/**
 * File Switch Terminal Button Test
 *
 * 测试切换 markdown 文件后 terminal 按钮的状态
 */

import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const SERVER_URL = 'http://localhost:8000'

async function testFileSwitchTerminalButton() {
  console.log('=== File Switch Terminal Button Test ===\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const context = await browser.newContext()

  try {
    const page = await context.newPage()
    await page.goto(SERVER_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.script-block', { timeout: 10000 })

    // 获取第一个文件
    const fileSelect = page.locator('#file-select')
    await fileSelect.waitFor({ timeout: 10000 })
    const firstFileName = await fileSelect.evaluate(el => el.options[el.selectedIndex]?.text || '')
    console.log(`当前文件: ${firstFileName}`)

    // 获取第一个脚本块
    const firstBlock = page.locator('.script-block').first()
    const scriptId = await firstBlock.getAttribute('data-script-id')
    console.log(`脚本 ID: ${scriptId}`)

    // 点击 run 按钮执行脚本
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

    // 关闭终端弹窗
    await page.locator('.terminal-close-btn').click()
    await page.waitForTimeout(500)

    // 验证 terminal 按钮状态
    const resultBtn = firstBlock.locator('.result-btn')
    const resultBtnStatus = await resultBtn.getAttribute('data-status')
    const resultBtnText = await resultBtn.textContent()
    const resultBtnDisabled = await resultBtn.isDisabled()

    console.log(`Terminal 按钮状态: ${resultBtnStatus}`)
    console.log(`Terminal 按钮文本: ${resultBtnText}`)
    console.log(`Terminal 按钮禁用: ${resultBtnDisabled}`)

    if (resultBtnDisabled) {
      throw new Error('Terminal 按钮不应该被禁用')
    }
    console.log('✓ Terminal 按钮可以点击')

    // 切换到另一个文件
    console.log('\n切换到另一个文件...')
    const options = await fileSelect.evaluate(el => {
      return Array.from(el.options).map(opt => ({
        value: opt.value,
        text: opt.text,
        disabled: opt.disabled
      }))
    })

    const enabledOptions = options.filter(opt => !opt.disabled && opt.value !== '')
    console.log(`  可用文件: ${enabledOptions.map(o => o.text).join(', ')}`)

    if (enabledOptions.length < 2) {
      console.log('⚠️  只有一个可用文件，跳过文件切换测试')
    } else {
      // 切换到第二个文件
      const secondOption = enabledOptions[1]
      console.log(`  切换到: ${secondOption.text}`)
      await fileSelect.selectOption(secondOption.value)
      await page.waitForTimeout(1000)

      // 再次切换回第一个文件
      console.log(`  切换回: ${firstFileName}`)
      await fileSelect.selectOption(enabledOptions[0].value)
      await page.waitForTimeout(1000)

      // 验证 terminal 按钮状态
      const resultBtnAfterSwitch = page.locator(`[data-script-id="${scriptId}"] .result-btn`)
      const resultBtnStatusAfterSwitch = await resultBtnAfterSwitch.getAttribute('data-status')
      const resultBtnTextAfterSwitch = await resultBtnAfterSwitch.textContent()
      const resultBtnDisabledAfterSwitch = await resultBtnAfterSwitch.isDisabled()

      console.log(`  Terminal 按钮状态: ${resultBtnStatusAfterSwitch}`)
      console.log(`  Terminal 按钮文本: ${resultBtnTextAfterSwitch}`)
      console.log(`  Terminal 按钮禁用: ${resultBtnDisabledAfterSwitch}`)

      if (resultBtnDisabledAfterSwitch) {
        throw new Error('切换文件后 Terminal 按钮不应该被禁用')
      }
      console.log('  ✓ 切换文件后 Terminal 按钮仍然可以点击')

      // 点击 terminal 按钮验证可以打开终端
      console.log('  点击 Terminal 按钮...')
      await resultBtnAfterSwitch.click()
      await page.waitForSelector('.terminal-modal', { timeout: 10000 })
      console.log('  ✓ 终端弹窗已打开')

      // 验证终端有内容
      await page.waitForTimeout(500)
      const terminalContent = await page.evaluate(() => {
        const xtermEl = document.querySelector('.terminal-modal .xterm')
        if (!xtermEl) return ''
        return xtermEl.textContent || ''
      })

      if (terminalContent.length === 0) {
        throw new Error('终端内容为空')
      }
      console.log(`  ✓ 终端有内容 (${terminalContent.length} 字符)`)
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
testFileSwitchTerminalButton().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})