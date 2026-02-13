<script setup>
import { ref, nextTick, computed } from 'vue'
import FileList from './FileList.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { getFileContent } from '../api/files.js'

const sidebarWidth = ref(250)
const topPanelFlex = ref(0.5)  // flex value for top panel (0-1)

// Local markdown state (top panel)
const localMdFilename = ref('')
const localMdContent = ref('')
const localMdLoading = ref(false)
const localMdError = ref('')

// Terminal state (bottom panel)
const activeTerminalKey = ref('')
const terminalRefs = {}

const showTopPanel = computed(() => localMdFilename.value !== '')
const showBottomPanel = computed(() => activeTerminalKey.value !== '')

const topPanelStyle = computed(() => {
    const flex = showBottomPanel.value ? topPanelFlex.value : 1
    return { flex }
})

const bottomPanelStyle = computed(() => {
    const flex = showTopPanel.value ? (1 - topPanelFlex.value) : 1
    return { flex }
})

async function loadLocalMarkdown(filename) {
    localMdFilename.value = filename
    localMdLoading.value = true
    localMdError.value = ''
    localMdContent.value = ''

    try {
        const content = await getFileContent(filename)
        localMdContent.value = content
    } catch (err) {
        localMdError.value = err.message || 'Failed to load file'
        console.error('Error loading file:', err)
    } finally {
        localMdLoading.value = false
    }
}

function getTerminalRef(key) {
    return terminalRefs[key]
}

function setTerminalRef(key, el) {
    terminalRefs[key] = el
}

// Build wsUrl from terminal config filename
const wsUrl = computed(() => (configFilename) => {
    const backendHost = import.meta.env.DEV ? 'localhost:8080' : window.location.host
    return `ws://${backendHost}/ws/${configFilename}`
})

function onExecuteCommand(command) {
    const terminalRef = getTerminalRef(activeTerminalKey.value)
    if (terminalRef) {
        terminalRef.sendCommand(command)
        terminalRef.focus()
    }
}

async function onFileSelect(selection) {
    // Handle local markdown files (top panel)
    if (selection.isLocal) {
        // Toggle: if same file clicked, close it
        if (localMdFilename.value === selection.filename) {
            localMdFilename.value = ''
            return
        }
        await loadLocalMarkdown(selection.filename)
        return
    }

    // Handle terminal config files (bottom panel)
    const filename = selection.filename

    if (filename) {
        // Toggle: if same file clicked, close it
        if (activeTerminalKey.value === filename) {
            activeTerminalKey.value = ''
            return
        }
        activeTerminalKey.value = filename

        await nextTick()
        const terminalRef = getTerminalRef(filename)
        if (terminalRef) {
            terminalRef.focus()
        }
    }
}

function startSidebarResize(event) {
    const startX = event.clientX
    const startWidth = sidebarWidth.value

    function onMouseMove(e) {
        const deltaX = e.clientX - startX
        let newWidth = startWidth + deltaX
        newWidth = Math.max(150, Math.min(500, newWidth))
        sidebarWidth.value = newWidth
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
}

function startTerminalResize() {
    const content = document.querySelector('.content')
    if (!content) return
    const rect = content.getBoundingClientRect()

    function onMouseMove(e) {
        const relativeY = e.clientY - rect.top
        const newFlex = Math.max(0.1, Math.min(0.9, relativeY / rect.height))
        topPanelFlex.value = newFlex
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove, { passive: false })
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
}
</script>

<template>
    <div class="layout">
        <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
            <FileList @select="onFileSelect" />
        </div>
        <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
        <div class="main">
            <div class="content">
                <!-- Top panel: Markdown viewer -->
                <div v-if="showTopPanel" class="top-panel" :style="topPanelStyle">
                    <div v-if="localMdLoading" class="loading-state">Loading...</div>
                    <div v-else-if="localMdError" class="error-state">{{ localMdError }}</div>
                    <MarkdownViewer v-else :content="localMdContent" :on-execute-command="onExecuteCommand" />
                </div>

                <!-- Panel resizer -->
                <div v-if="showTopPanel && showBottomPanel" class="panel-resizer" @mousedown="startTerminalResize"></div>

                <!-- Bottom panel: Terminal -->
                <div v-if="showBottomPanel" class="bottom-panel" :style="bottomPanelStyle">
                    <div class="terminal-header">
                        <span class="terminal-label">{{ activeTerminalKey }}</span>
                    </div>
                    <div class="terminal-body">
                        <Terminal
                            :ref="el => setTerminalRef(activeTerminalKey, el)"
                            :ws-url="wsUrl(activeTerminalKey)"
                        />
                    </div>
                </div>

                <!-- Empty state -->
                <div v-if="!showTopPanel && !showBottomPanel" class="empty-state">
                    <div class="empty-content">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 2v16a2 2 0 0 2 6a2 2 0 0 2 6a2 2 0 0 2-2 2h16a2 2 0 0 2 6a2 2 0 0 2-2V8z"></path>
                            <polyline points="14 2 16 8 20 8"></polyline>
                            <line x1="16" y1="13" x2="8" y2="13"></line>
                            <polyline points="14 2 14 8 20 8"></polyline>
                            <polyline points="10 9 9 9 8 9"></polyline>
                        </svg>
                        <h2>Select a file to get started</h2>
                        <p>Click a markdown file or terminal config to begin</p>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.layout {
    display: flex;
    height: 100vh;
    width: 100vw;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

.sidebar {
    width: 250px;
    height: 100%;
    background-color: #1e1e1e;
}

.sidebar-resizer {
    width: 4px;
    height: 100%;
    background-color: #2a2a2a;
    border-left: 1px solid #333;
    cursor: col-resize;
    transition: background-color 0.2s;
}

.sidebar-resizer:hover {
    background-color: #555;
}

.main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.top-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-bottom: 1px solid #444;
    min-height: 0;
}

.panel-resizer {
    height: 4px;
    width: 100%;
    background-color: #2a2a2a;
    border-top: 1px solid #333;
    border-bottom: 1px solid #333;
    cursor: row-resize;
    transition: background-color 0.2s;
    flex-shrink: 0;
}

.panel-resizer:hover {
    background-color: #555;
}

.bottom-panel {
    display: flex;
    flex-direction: column;
    min-height: 100px;
    background-color: #1e1e1e;
}

.terminal-header {
    padding: 6px 12px;
    background-color: #2a2a2a;
    border-top: 1px solid #444;
    display: flex;
    align-items: center;
}

.terminal-label {
    font-size: 11px;
    color: #888;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}

.terminal-body {
    flex: 1;
    overflow: hidden;
}

.loading-state,
.error-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #1e1e1e;
    color: #888;
}

.error-state {
    color: #f48771;
}

.empty-state {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: #1e1e1e;
}

.empty-content {
    text-align: center;
    color: #666;
}

.empty-content svg {
    color: #444;
    margin-bottom: 16px;
}

.empty-content h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 500;
    color: #888;
}

.empty-content p {
    margin: 0;
    font-size: 14px;
    color: #666;
}
</style>
