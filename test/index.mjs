/**
 * Test Runner - 运行所有 Playwright 测试
 *
 * 运行: node test/index.mjs
 * 或: npm test
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readdirSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const testDir = join(__dirname, '..', 'test')

// 自动读取所有 .test.mjs 文件
const testFiles = readdirSync(testDir)
  .filter(file => file.endsWith('.test.mjs'))
  .sort() // 按文件名排序，确保执行顺序一致

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
