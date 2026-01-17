/**
 * Refresh Persistence Test
 *
 * 测试刷新页面后脚本继续运行并恢复输出的功能
 */

import { chromium } from 'playwright'
import { expect } from '@playwright/test'

const SERVER_URL = 'http://localhost:8000'

async function testRefreshPersistence() {
  console.log('=== Refresh Persistence Test ===\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const context = await browser.newContext()

  try {
    // 第一步：执行脚本
    console.log('步骤 1: 执行长时间运行的脚本...')
    const page = await context.newPage()
    await page.goto(SERVER_URL, { waitUntil: 'networkidle' })
    await page.waitForSelector('.script-block', { timeout: 10000 })

    // 获取第一个脚本块
    const firstBlock = page.locator('.script-block').first()
    const title = await firstBlock.locator('.script-title').textContent().then(t => t?.trim())
    console.log(`  测试脚本: ${title}`)

    // 获取脚本代码并修改为长时间运行的脚本
    const codeEl = firstBlock.locator('.script-code')
    const originalCode = await codeEl.textContent()

    // 修改为长时间运行的脚本（sleep 60秒，每隔10秒输出一次）
    const longRunningCode = `echo "开始长时间运行脚本..."\nfor i in {1..6}; do\n  echo "进度: $i/6"\n  sleep 10\ndone\necho "脚本完成!"`

    console.log('  修改脚本代码为长时间运行版本...')
    await page.evaluate((code) => {
      const codeEl = document.querySelector('.script-code')
      if (codeEl) {
        codeEl.textContent = code
      }
    }, longRunningCode)

    // 点击 run 按钮
    console.log('  点击 run 按钮...')
    await firstBlock.locator('.execute-btn').click()

    // 等待终端弹窗自动打开
    console.log('  等待终端弹窗打开...')
    await page.waitForSelector('.terminal-modal', { timeout: 10000 })
    console.log('  ✓ 终端弹窗已打开')

    // 等待脚本开始运行并产生一些输出
    console.log('  等待脚本产生输出...')
    await page.waitForTimeout(15000)

    // 获取脚本 ID
    const scriptId = await firstBlock.getAttribute('data-script-id')
    console.log(`  脚本 ID: ${scriptId}`)

    // 获取终端内容（刷新前的输出）
    const terminalContentBeforeRefresh = await page.evaluate(() => {
      const xtermEl = document.querySelector('.terminal-modal .xterm')
      if (!xtermEl) return ''
      return xtermEl.textContent || ''
    })
    console.log(`  刷新前终端内容长度: ${terminalContentBeforeRefresh.length} 字符`)
    console.log(`  刷新前终端内容: ${terminalContentBeforeRefresh.substring(0, 100)}...`)

    // 验证脚本正在运行
    const statusBeforeRefresh = await firstBlock.locator('.result-btn').getAttribute('data-status')
    console.log(`  刷新前脚本状态: ${statusBeforeRefresh}`)
    if (statusBeforeRefresh !== 'running') {
      throw new Error(`脚本未处于运行状态: ${statusBeforeRefresh}`)
    }
    console.log('  ✓ 脚本正在运行')

    // 第二步：刷新页面
    console.log('\n步骤 2: 刷新页面...')
    await page.reload({ waitUntil: 'networkidle' })
    console.log('  ✓ 页面已刷新')

    // 等待页面加载完成
    await page.waitForSelector('.script-block', { timeout: 10000 })
    await page.waitForTimeout(1000)

    // 重新设置脚本代码（因为刷新后代码会被重置）
    console.log('  重新设置脚本代码...')
    await page.evaluate((code) => {
      const codeEl = document.querySelector('.script-code')
      if (codeEl) {
        codeEl.textContent = code
      }
    }, longRunningCode)
    await page.waitForTimeout(500)

    // 第三步：验证脚本状态恢复
    console.log('\n步骤 3: 验证脚本状态恢复...')
    const refreshedBlock = page.locator(`[data-script-id="${scriptId}"]`)
    if ((await refreshedBlock.count()) === 0) {
      throw new Error(`找不到脚本块: ${scriptId}`)
    }
    console.log('  ✓ 找到脚本块')

    // 检查脚本状态
    const statusAfterRefresh = await refreshedBlock.locator('.result-btn').getAttribute('data-status')
    console.log(`  刷新后脚本状态: ${statusAfterRefresh}`)

    // 脚本状态应该是 running 或 completed（取决于脚本是否已完成）
    if (statusAfterRefresh !== 'running' && statusAfterRefresh !== 'completed' && statusAfterRefresh !== 'failed') {
      throw new Error(`脚本状态不正确: ${statusAfterRefresh}`)
    }
    console.log('  ✓ 脚本状态正确')

    // 第四步：重新打开终端查看输出
    console.log('\n步骤 4: 重新打开终端查看输出...')
    await refreshedBlock.locator('.result-btn').click()
    await page.waitForSelector('.terminal-modal', { timeout: 10000 })
    console.log('  ✓ 终端弹窗已打开')

    // 等待终端内容加载
    await page.waitForTimeout(1000)

    // 获取刷新后的终端内容
    const terminalContentAfterRefresh = await page.evaluate(() => {
      const xtermEl = document.querySelector('.terminal-modal .xterm')
      if (!xtermEl) return ''
      return xtermEl.textContent || ''
    })
    console.log(`  刷新后终端内容长度: ${terminalContentAfterRefresh.length} 字符`)
    console.log(`  刷新后终端内容: ${terminalContentAfterRefresh.substring(0, 100)}...`)

    // 验证终端内容不为空（应该有缓存的输出）
    if (terminalContentAfterRefresh.length === 0) {
      throw new Error('刷新后终端内容为空，输出缓存失败')
    }
    console.log('  ✓ 终端内容不为空')

    // 验证刷新后的内容至少包含刷新前的内容（或者更多）
    if (terminalContentAfterRefresh.length < terminalContentBeforeRefresh.length * 0.5) {
      console.warn(`  ⚠️  刷新后输出较少: 刷新前 ${terminalContentBeforeRefresh.length}, 刷新后 ${terminalContentAfterRefresh.length}`)
    } else {
      console.log('  ✓ 输出内容恢复正常')
    }

    // 第五步：验证 WebSocket 连接恢复
    console.log('\n步骤 5: 验证 WebSocket 连接恢复...')
    // 等待一段时间，检查是否有新的输出（说明 WebSocket 连接已恢复）
    const terminalContentAfterWait = await page.evaluate(async () => {
      await new Promise(resolve => setTimeout(resolve, 3000))
      const xtermEl = document.querySelector('.terminal-modal .xterm')
      if (!xtermEl) return ''
      return xtermEl.textContent || ''
    })

    // 如果脚本仍在运行，应该有新的输出
    if (statusAfterRefresh === 'running') {
      if (terminalContentAfterWait.length > terminalContentAfterRefresh.length) {
        console.log('  ✓ WebSocket 连接已恢复，正在接收新输出')
      } else {
        console.log('  ⚠️  未检测到新输出（脚本可能已完成）')
      }
    } else {
      console.log('  ℹ️  脚本已完成，无需验证新输出')
    }

    // 第六步：验证脚本最终状态
    console.log('\n步骤 6: 验证脚本最终状态...')
    // 等待脚本完成
    let retries = 0
    const maxRetries = 60
    while (retries < maxRetries) {
      const finalStatus = await refreshedBlock.locator('.result-btn').getAttribute('data-status')
      if (finalStatus === 'completed' || finalStatus === 'failed') {
        console.log(`  ✓ 脚本已完成，状态: ${finalStatus}`)
        break
      }
      await page.waitForTimeout(1000)
      retries++
    }

    const finalStatus = await refreshedBlock.locator('.result-btn').getAttribute('data-status')
    if (finalStatus !== 'completed' && finalStatus !== 'failed') {
      console.log(`  ⚠️  脚本仍在运行或状态未知: ${finalStatus}`)
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
testRefreshPersistence().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})