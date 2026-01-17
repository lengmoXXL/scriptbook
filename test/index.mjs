/**
 * Test Runner - 运行所有 Playwright 测试
 *
 * 运行: node test/index.mjs
 * 或: npm test
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const testDir = join(__dirname, '..', 'test')
const testFiles = [
  'interactive.test.mjs',    // 交互式输入测试
  'features.test.mjs',       // 功能集成测试
  'script-state.test.mjs',   // 脚本状态测试
  'theme-color.test.mjs'     // 主题配色测试
]

async function runTest(file) {
  return new Promise((resolve) => {
    console.log(`\n=== Running ${file} ===\n`)

    const child = spawn('node', [join(testDir, file)], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })

    child.on('close', (code) => {
      resolve(code)
    })

    child.on('error', (err) => {
      console.error(`Failed to run ${file}:`, err)
      resolve(1)
    })
  })
}

async function main() {
  console.log('='.repeat(60))
  console.log('🧪 Playwright Tests')
  console.log('='.repeat(60))

  let hasFailure = false

  for (const file of testFiles) {
    const code = await runTest(file)
    if (code !== 0) {
      hasFailure = true
    }
  }

  console.log('\n' + '='.repeat(60))

  if (hasFailure) {
    console.log('❌ Some tests failed')
    process.exit(1)
  } else {
    console.log('✅ All tests passed')
    process.exit(0)
  }
}

main()
