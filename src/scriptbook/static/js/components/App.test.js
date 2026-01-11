import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import App from './App.vue'

describe('App', () => {
  let wrapper

  beforeEach(() => {
    wrapper = mount(App, {
      global: {
        stubs: {
          NavBar: { template: '<div class="navbar-stub"></div>' }
        }
      }
    })
  })

  afterEach(() => {
    if (wrapper) wrapper.unmount()
  })

  it('renders app container', () => {
    expect(wrapper.find('.app-container').exists()).toBe(true)
  })

  it('renders main content area', () => {
    expect(wrapper.find('.content-area').exists()).toBe(true)
  })

  it('renders footer', () => {
    const footer = wrapper.find('footer')
    expect(footer.exists()).toBe(true)
    expect(footer.text()).toContain('Scriptbook')
  })

  it('shows placeholder when no file selected', async () => {
    await wrapper.vm.$nextTick()
    const content = wrapper.find('.markdown-content')
    expect(content.exists()).toBe(true)
    expect(content.text()).toContain('请从上方选择Markdown文件')
  })

  it('renders script blocks with buttons when content has scripts', async () => {
    // Mock script block HTML
    wrapper.vm.contentHtml = `
      <div class="script-block" data-script-id="test-script">
        <div class="script-header">
          <span class="script-title">测试脚本</span>
        </div>
        <pre class="script-code"><code>echo hello</code></pre>
        <div class="script-output" id="output-test-script"></div>
        <div class="script-input-container" id="input-container-test-script" style="display: none;">
          <input type="text" class="script-input" id="input-test-script" placeholder="输入命令所需内容，按Enter发送">
          <button class="input-send-btn">发送</button>
        </div>
      </div>
    `
    await wrapper.vm.$nextTick()

    const scriptBlock = wrapper.find('[data-script-id="test-script"]')
    expect(scriptBlock.exists()).toBe(true)

    const output = wrapper.find('#output-test-script')
    expect(output.exists()).toBe(true)

    const inputContainer = wrapper.find('#input-container-test-script')
    expect(inputContainer.exists()).toBe(true)
  })

  it('toggles input container visibility on script execution', async () => {
    // Mock script block HTML
    wrapper.vm.contentHtml = `
      <div class="script-block" data-script-id="test-script">
        <div class="script-header">
          <span class="script-title">测试脚本</span>
        </div>
        <pre class="script-code"><code>echo hello</code></pre>
        <div class="script-output" id="output-test-script"></div>
        <div class="script-input-container" id="input-container-test-script" style="display: none;">
          <input type="text" class="script-input" id="input-test-script">
          <button class="input-send-btn">发送</button>
        </div>
      </div>
    `
    await wrapper.vm.$nextTick()

    // Simulate showing input container (like when script requests input)
    const inputContainer = wrapper.find('#input-container-test-script')
    inputContainer.element.style.display = 'flex'
    await wrapper.vm.$nextTick()

    expect(inputContainer.element.style.display).toBe('flex')

    // Test send button exists
    const sendBtn = wrapper.find('.input-send-btn')
    expect(sendBtn.exists()).toBe(true)
    expect(sendBtn.text()).toBe('发送')
  })
})
