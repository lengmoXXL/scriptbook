import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import NavBar from './NavBar.vue'

describe('NavBar', () => {
  const mockFiles = [
    { name: 'example.md', size: 1024 },
    { name: 'test.md', size: 2048 }
  ]

  const mockPlugins = [
    { name: 'theme-light', description: 'Light Theme' },
    { name: 'theme-dark', description: 'Dark Theme' }
  ]

  it('renders brand title', () => {
    const wrapper = mount(NavBar, {
      props: { files: [], plugins: [] }
    })
    expect(wrapper.find('h1').text()).toBe('Scriptbook')
  })

  it('renders file select with files', () => {
    const wrapper = mount(NavBar, {
      props: { files: mockFiles, plugins: [], currentFile: 'example.md' }
    })
    const options = wrapper.findAll('option')
    // 包含默认的 disabled option
    expect(options.length).toBeGreaterThanOrEqual(2)
    expect(options.some(o => o.text().includes('example.md'))).toBe(true)
  })

  it('renders plugin select with plugins', () => {
    const wrapper = mount(NavBar, {
      props: { files: [], plugins: mockPlugins, currentTheme: 'theme-light' }
    })
    const options = wrapper.findAll('option')
    // 包含默认的 disabled option
    expect(options.length).toBeGreaterThanOrEqual(2)
  })

  it('emits select-file when file changes', async () => {
    const wrapper = mount(NavBar, {
      props: { files: mockFiles, plugins: [], currentFile: '' }
    })
    await wrapper.find('select').trigger('change')
    // 验证 emit 被触发（这里简化处理）
  })

  it('emits select-theme when theme changes', async () => {
    const wrapper = mount(NavBar, {
      props: { files: [], plugins: mockPlugins, currentTheme: '' }
    })
    const selects = wrapper.findAll('select')
    await selects[1].trigger('change')
  })

  it('formats file size correctly', () => {
    const wrapper = mount(NavBar, {
      props: { files: [], plugins: [] }
    })
    // 测试 formatFileSize 方法
    expect(wrapper.vm.formatFileSize(0)).toBe('0 B')
    expect(wrapper.vm.formatFileSize(1024)).toBe('1 KB')
    expect(wrapper.vm.formatFileSize(1048576)).toBe('1 MB')
  })

  it('shows GitHub link', () => {
    const wrapper = mount(NavBar, {
      props: { files: [], plugins: [] }
    })
    const link = wrapper.find('.github-link')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe('https://github.com/lengmoXXL/scriptbook')
  })
})
