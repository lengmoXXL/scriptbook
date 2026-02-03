import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

const DEFAULT_THEME = {
  background: '#1e1e1e',
  foreground: '#f0f0f0',
  cursor: '#00ff00'
}

const DEFAULT_FONT_SIZE = 14
const DEFAULT_FONT_FAMILY = 'Menlo, Monaco, "Courier New", monospace'

export function useTerminal({
  containerRef,
  onInput,
  onResize,
  theme = DEFAULT_THEME,
  fontSize = DEFAULT_FONT_SIZE,
  fontFamily = DEFAULT_FONT_FAMILY
}) {
  const term = ref(null)
  const fitAddon = ref(null)
  const resizeObserver = ref(null)

  const isReady = ref(false)
  const dimensions = ref(null)

  function initTerminal() {
    if (!containerRef.value) {
      throw new Error('Terminal container missing: containerRef is null')
    }

    term.value = new Terminal({
      cursorBlink: true,
      theme,
      fontSize,
      fontFamily
    })

    fitAddon.value = new FitAddon()
    term.value.loadAddon(fitAddon.value)
    term.value.loadAddon(new WebLinksAddon())

    term.value.open(containerRef.value)
    fitAddon.value.fit()

    // Expose terminal instance for tests
    window.terminalInstance = term.value

    isReady.value = true
    dimensions.value = term.value.dimensions

    containerRef.value.addEventListener('click', () => {
      if (!term.value) return
      term.value.focus()
    })

    term.value.onData((data) => {
      onInput?.(data)
    })

    term.value.onResize((size) => {
      dimensions.value = size
      onResize?.(size.rows, size.cols)
    })
  }

  function write(data) {
    if (!term.value) return
    term.value.write(data)
  }

  function focus() {
    if (!term.value) return
    term.value.focus()
  }

  function fit() {
    if (!fitAddon.value) return
    fitAddon.value.fit()
    if (term.value?.dimensions) {
      dimensions.value = term.value.dimensions
    }
  }

  function dispose() {
    if (window.terminalInstance === term.value) {
      window.terminalInstance = null
    }

    if (term.value) {
      try {
        term.value.dispose()
      } catch (e) {
        if (e.message?.includes('Could not dispose an addon that has not been loaded')) {
          console.warn('[useTerminal] xterm.js addon disposal warning (library bug, safe to ignore)')
        } else {
          console.error('[useTerminal] Unexpected disposal error:', e)
        }
      }
      term.value = null
    }

    if (resizeObserver.value) {
      resizeObserver.value.disconnect()
      resizeObserver.value = null
    }

    isReady.value = false
    dimensions.value = null
  }

  onMounted(() => {
    initTerminal()

    resizeObserver.value = new ResizeObserver(() => {
      fit()
    })
    resizeObserver.value.observe(containerRef.value)

    nextTick(() => {
      fit()
    })
  })

  onUnmounted(() => {
    dispose()
  })

  return {
    isReady,
    dimensions,
    write,
    focus,
    fit,
    dispose,
    getTerminal: () => term.value
  }
}
