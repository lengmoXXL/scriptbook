/**
 * 主题配色验证测试
 * 验证终端弹窗的配色是否与当前主题一致
 */

import { chromium } from 'playwright'

async function testThemeColorConsistency() {
  console.log('\n=== 测试：终端弹窗主题配色一致性 ===\n')

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  })
  const page = await browser.newPage()

  const colorSchemes = [
    {
      name: 'GitHub Light',
      expectedModalBg: 'rgb(255, 255, 255)', // #ffffff (color-background)
      expectedTerminalBg: 'rgb(246, 248, 250)', // #f6f8fa (terminalTheme.background)
      expectedTitleColor: 'rgb(36, 41, 47)', // #24292f (color-text)
      expectedTitleBg: 'rgb(246, 248, 250)', // #f6f8fa (color-surface-alt)
      selectValue: 'GitHub 主题'
    },
    {
      name: 'GitHub Dark',
      expectedModalBg: 'rgb(13, 17, 23)', // #0d1117 (color-background)
      expectedTerminalBg: 'rgb(13, 17, 23)', // #0d1117 (terminalTheme.background)
      expectedTitleColor: 'rgb(201, 209, 217)', // #c9d1d9 (color-text)
      expectedTitleBg: 'rgb(33, 38, 45)', // #21262d (color-surface-alt)
      selectValue: 'GitHub Dark 主题'
    }
  ]

  try {
    await page.goto('http://localhost:8000', {
      waitUntil: 'networkidle',
      headers: { 'Cache-Control': 'no-cache' }
    })
    await page.waitForSelector('#file-select', { timeout: 10000 })

    for (const scheme of colorSchemes) {
      console.log(`--- 验证 ${scheme.name} 主题 ---`)

      // 切换主题
      await page.selectOption('#plugin-select', scheme.selectValue)
      // 等待主题切换和终端主题更新
      await page.waitForTimeout(500)

      // 选择包含脚本的文件
      await page.selectOption('#file-select', 'example.md')
      await page.waitForTimeout(500)

      // 点击执行脚本（弹窗会自动打开）
      await page.locator('.script-block').first().locator('.execute-btn').click()

      // 等待弹窗自动打开
      await page.waitForSelector('.terminal-modal', { timeout: 10000 })
      await page.waitForTimeout(500)

      // 等待脚本执行完成（简单脚本很快）
      await page.waitForFunction(() => {
        const btn = document.querySelector('.script-block')?.querySelector('.result-btn')
        return btn?.getAttribute('data-status') === 'completed' || btn?.getAttribute('data-status') === 'running'
      }, { timeout: 10000 })

      await page.waitForTimeout(500)

      // 获取终端弹窗和终端的样式
      const styles = await page.evaluate(() => {
        const modal = document.querySelector('.terminal-modal')
        if (!modal) return null

        // 获取标题颜色和标题栏背景色
        const titleEl = modal.querySelector('.terminal-modal-header .terminal-title')
        const titleColor = titleEl ? window.getComputedStyle(titleEl).color : null

        const headerEl = modal.querySelector('.terminal-modal-header')
        const titleBg = headerEl ? window.getComputedStyle(headerEl).backgroundColor : null

        // 获取当前弹窗中终端容器的终端实例
        const terminalContainer = modal.querySelector('.terminal-container')
        let terminalThemeBg = null
        let terminalThemeFg = null

        if (terminalContainer) {
          const terminalId = terminalContainer.getAttribute('data-terminal-id')
          if (terminalId && window[terminalId]?.options?.theme) {
            const theme = window[terminalId].options.theme
            terminalThemeBg = theme.background || null
            terminalThemeFg = theme.foreground || null
          }
        }

        // 如果找不到，查找所有终端实例（备选）
        if (!terminalThemeBg) {
          for (const key in window) {
            if (key.startsWith('terminal_') && window[key]?.options?.theme) {
              const theme = window[key].options.theme
              terminalThemeBg = theme.background || null
              terminalThemeFg = theme.foreground || null
              break
            }
          }
        }

        return {
          modalBg: window.getComputedStyle(modal).backgroundColor,
          terminalThemeBg,
          terminalThemeFg,
          titleColor,
          titleBg
        }
      })

      if (!styles) {
        throw new Error('无法获取终端弹窗样式')
      }

      console.log(`  弹窗背景: ${styles.modalBg}`)
      console.log(`  终端背景: ${styles.terminalThemeBg}`)
      console.log(`  标题颜色: ${styles.titleColor}`)
      console.log(`  标题背景: ${styles.titleBg}`)
      console.log(`  预期弹窗背景: ${scheme.expectedModalBg}`)
      console.log(`  预期终端背景: ${scheme.expectedTerminalBg}`)
      console.log(`  预期标题颜色: ${scheme.expectedTitleColor}`)
      console.log(`  预期标题背景: ${scheme.expectedTitleBg}`)

      // 验证弹窗背景颜色
      const modalBgMatch = styles.modalBg === scheme.expectedModalBg
      if (!modalBgMatch) {
        console.log(`  ❌ ${scheme.name} 弹窗背景配色错误！`)
        console.log(`     预期: ${scheme.expectedModalBg}`)
        console.log(`     实际: ${styles.modalBg}`)
        throw new Error(`${scheme.name} 弹窗背景配色不正确`)
      }

      // 验证终端背景颜色（处理颜色格式差异）
      const normalizeColor = (color) => {
        if (!color) return null
        // 十六进制转 RGB
        if (color.startsWith('#')) {
          const hex = color.replace('#', '')
          const r = parseInt(hex.substring(0, 2), 16)
          const g = parseInt(hex.substring(2, 4), 16)
          const b = parseInt(hex.substring(4, 6), 16)
          return `rgb(${r}, ${g}, ${b})`
        }
        return color
      }

      const normalizedTerminalBg = normalizeColor(styles.terminalThemeBg)
      console.log(`  规范化终端背景: ${normalizedTerminalBg}`)
      const terminalBgMatch = normalizedTerminalBg === scheme.expectedTerminalBg
      if (!terminalBgMatch) {
        console.log(`  ❌ ${scheme.name} 终端背景配色错误！`)
        console.log(`     预期: ${scheme.expectedTerminalBg}`)
        console.log(`     实际: ${styles.terminalThemeBg} -> ${normalizedTerminalBg}`)

        // 打印所有终端实例的主题配置用于调试
        const allTerminals = await page.evaluate(() => {
          const terminals = []
          for (const key in window) {
            if (key.startsWith('terminal_') && window[key]?.options?.theme) {
              terminals.push({
                key,
                theme: window[key].options.theme
              })
            }
          }
          return terminals
        })
        console.log(`  所有终端实例主题: ${JSON.stringify(allTerminals)}`)
        throw new Error(`${scheme.name} 终端背景配色不正确`)
      }

      // 验证标题颜色
      const titleColorMatch = styles.titleColor === scheme.expectedTitleColor
      if (!titleColorMatch) {
        console.log(`  ❌ ${scheme.name} 标题颜色配色错误！`)
        console.log(`     预期: ${scheme.expectedTitleColor}`)
        console.log(`     实际: ${styles.titleColor}`)
        throw new Error(`${scheme.name} 标题颜色配色不正确`)
      }

      // 验证标题背景颜色
      const titleBgMatch = styles.titleBg === scheme.expectedTitleBg
      if (!titleBgMatch) {
        console.log(`  ❌ ${scheme.name} 标题背景配色错误！`)
        console.log(`     预期: ${scheme.expectedTitleBg}`)
        console.log(`     实际: ${styles.titleBg}`)
        throw new Error(`${scheme.name} 标题背景配色不正确`)
      }

      console.log(`  ✅ ${scheme.name} 主题配色正确\n`)

      // 关闭弹窗
      await page.locator('.terminal-close-btn').click()
      await page.waitForTimeout(500)
    }

    console.log('✅ 所有主题配色测试通过！\n')
  } catch (error) {
    console.error(`\n❌ 主题配色测试失败: ${error.message}\n`)
    await browser.close()
    process.exit(1)
  } finally {
    await browser.close()
  }
}

testThemeColorConsistency().catch(err => {
  console.error('测试运行失败:', err)
  process.exit(1)
})
