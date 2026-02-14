<script setup>
import { ref, nextTick, computed, onUnmounted } from 'vue'
import FileList from './FileList.vue'
import TabBar from './TabBar.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { getFileContent } from '../api/files.js'
import { useTabs } from '../composables/useTabs.js'
import { useError } from '../composables/useError.js'

const sidebarWidth = ref(250)
const topPanelFlex = ref(0.5)

// Markdown tabs
const mdTabs = useTabs()
const mdContents = ref({})
const mdLoading = ref({})
const mdErrors = ref({})

// Terminal tabs
const terminalTabs = useTabs()
const terminalRefs = {}

// Error handling
const { errorMessage, showError, showErrorModal, hideErrorModal } = useError()

// Resize handler refs for cleanup
let sidebarResizeHandler = null
let terminalResizeHandler = null

const showTopPanel = computed(() => mdTabs.tabs.value.length > 0)
const showBottomPanel = computed(() => terminalTabs.tabs.value.length > 0)

const topPanelStyle = computed(() => {
    const flex = showBottomPanel.value ? topPanelFlex.value : 1
    return { flex }
})

const bottomPanelStyle = computed(() => {
    const flex = showTopPanel.value ? (1 - topPanelFlex.value) : 1
    return { flex }
})

// Active markdown tab data
const activeMdContent = computed(() => {
    const tab = mdTabs.activeTab.value
    return tab ? mdContents.value[tab.id] || '' : ''
})

const activeMdLoading = computed(() => {
    const tab = mdTabs.activeTab.value
    return tab ? mdLoading.value[tab.id] || false : false
})

const activeMdError = computed(() => {
    const tab = mdTabs.activeTab.value
    return tab ? mdErrors.value[tab.id] || '' : ''
})

// Open markdown files passed to FileList for highlighting
const openMdFiles = computed(() =>
    mdTabs.tabs.value.map(t => t.filename)
)

// Open terminal files passed to FileList for highlighting
const openTerminalFiles = computed(() =>
    terminalTabs.tabs.value.map(t => t.filename)
)

async function loadMarkdownContent(tab) {
    mdLoading.value[tab.id] = true
    mdErrors.value[tab.id] = ''
    mdContents.value[tab.id] = ''

    try {
        const content = await getFileContent(tab.filename)
        mdContents.value[tab.id] = content
    } catch (err) {
        mdErrors.value[tab.id] = err.message || 'Failed to load file'
        console.error('Error loading file:', err)
    } finally {
        mdLoading.value[tab.id] = false
    }
}

function getTerminalRef(key) {
    return terminalRefs[key]
}

function setTerminalRef(key, el) {
    terminalRefs[key] = el
}

const backendHost = computed(() =>
    import.meta.env.DEV ? 'localhost:8080' : window.location.host
)

function getWsUrl(filename, tabId) {
    return `ws://${backendHost.value}/ws/${filename}/${tabId}`
}

function onExecuteCommand(command) {
    const tab = terminalTabs.activeTab.value
    if (!tab) {
        showErrorModal('No terminal open. Please open a terminal first.')
        return
    }
    const terminalRef = getTerminalRef(tab.id)
    if (!terminalRef) {
        showErrorModal('Terminal not ready. Please try again.')
        return
    }
    terminalRef.sendCommand(command)
    terminalRef.focus()
}

async function onFileSelect(selection) {
    if (selection.isLocal) {
        // Markdown file
        const tab = mdTabs.openTab(selection.filename)
        if (!mdContents.value[tab.id]) {
            await loadMarkdownContent(tab)
        }
        return
    }

    // Terminal config file
    const filename = selection.filename
    if (!filename) {
        showErrorModal('Invalid terminal selection: no filename provided')
        return
    }
    const tab = terminalTabs.openTab(filename)
    await nextTick()
    const terminalRef = getTerminalRef(tab.id)
    if (terminalRef) {
        terminalRef.focus()
    }
}

function onMdTabSelect(id) {
    mdTabs.selectTab(id)
}

function onMdTabClose(id) {
    const tab = mdTabs.tabs.value.find(t => t.id === id)
    if (tab) {
        delete mdContents.value[id]
        delete mdLoading.value[id]
        delete mdErrors.value[id]
    }
    mdTabs.closeTab(id)
}

function onTerminalTabSelect(id) {
    terminalTabs.selectTab(id)
    nextTick(() => {
        const terminalRef = getTerminalRef(id)
        if (terminalRef) {
            terminalRef.focus()
        }
    })
}

function onTerminalTabClose(id) {
    terminalTabs.closeTab(id)
}

function onTerminalError(error) {
    showErrorModal(error)
}

function closeErrorModal() {
    hideErrorModal()
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
        sidebarResizeHandler = null
    }

    sidebarResizeHandler = { onMouseMove, onMouseUp }
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
}

function startTerminalResize() {
    const content = document.querySelector('.content')
    if (!content) {
        throw new Error('Terminal resize failed: content element not found')
    }
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
        terminalResizeHandler = null
    }

    terminalResizeHandler = { onMouseMove, onMouseUp }
    document.addEventListener('mousemove', onMouseMove, { passive: false })
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
}

onUnmounted(() => {
    if (sidebarResizeHandler) {
        document.removeEventListener('mousemove', sidebarResizeHandler.onMouseMove)
        document.removeEventListener('mouseup', sidebarResizeHandler.onMouseUp)
    }
    if (terminalResizeHandler) {
        document.removeEventListener('mousemove', terminalResizeHandler.onMouseMove)
        document.removeEventListener('mouseup', terminalResizeHandler.onMouseUp)
    }
})
</script>

<template>
    <div class="layout">
        <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
            <FileList
                :open-md-files="openMdFiles"
                :open-terminal-files="openTerminalFiles"
                @select="onFileSelect"
            />
        </div>
        <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
        <div class="main">
            <div class="content">
                <!-- Top panel: Markdown tabs + viewer -->
                <div v-if="showTopPanel" class="top-panel" :style="topPanelStyle">
                    <TabBar
                        :tabs="mdTabs.tabs.value"
                        :active-tab-id="mdTabs.activeTabId.value"
                        @select="onMdTabSelect"
                        @close="onMdTabClose"
                    />
                    <div class="panel-content">
                        <div v-if="activeMdLoading" class="loading-state">Loading...</div>
                        <div v-else-if="activeMdError" class="error-state">{{ activeMdError }}</div>
                        <MarkdownViewer v-else :content="activeMdContent" :on-execute-command="onExecuteCommand" />
                    </div>
                </div>

                <!-- Panel resizer -->
                <div v-if="showTopPanel && showBottomPanel" class="panel-resizer" @mousedown="startTerminalResize"></div>

                <!-- Bottom panel: Terminal tabs + terminal -->
                <div v-if="showBottomPanel" class="bottom-panel" :style="bottomPanelStyle">
                    <TabBar
                        :tabs="terminalTabs.tabs.value"
                        :active-tab-id="terminalTabs.activeTabId.value"
                        @select="onTerminalTabSelect"
                        @close="onTerminalTabClose"
                    />
                    <div class="terminal-container">
                        <div
                            v-for="tab in terminalTabs.tabs.value"
                            :key="tab.id"
                            v-show="tab.id === terminalTabs.activeTabId.value"
                            class="terminal-instance"
                        >
                            <Terminal
                                :ref="el => setTerminalRef(tab.id, el)"
                                :ws-url="getWsUrl(tab.filename, tab.id)"
                                @error="onTerminalError"
                            />
                        </div>
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

    <!-- Error Modal -->
    <div v-if="showError" class="error-modal-overlay" @click="closeErrorModal">
        <div class="error-modal" @click.stop>
            <div class="error-modal-header">
                <span class="error-modal-title">Error</span>
                <button class="error-modal-close" @click="closeErrorModal">×</button>
            </div>
            <div class="error-modal-body">{{ errorMessage }}</div>
            <div class="error-modal-footer">
                <button class="error-modal-btn" @click="closeErrorModal">OK</button>
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

.panel-content {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px 24px;
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

.terminal-container {
    flex: 1;
    overflow: hidden;
    position: relative;
}

.terminal-instance {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
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

.error-modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.error-modal {
    background-color: #2d2d2d;
    border-radius: 8px;
    min-width: 300px;
    max-width: 500px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.error-modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid #444;
}

.error-modal-title {
    font-size: 16px;
    font-weight: 600;
    color: #f48771;
}

.error-modal-close {
    background: none;
    border: none;
    color: #888;
    font-size: 20px;
    cursor: pointer;
    padding: 0;
    line-height: 1;
}

.error-modal-close:hover {
    color: #f0f0f0;
}

.error-modal-body {
    padding: 20px 16px;
    color: #f0f0f0;
    font-size: 14px;
    line-height: 1.5;
}

.error-modal-footer {
    padding: 12px 16px;
    border-top: 1px solid #444;
    display: flex;
    justify-content: flex-end;
}

.error-modal-btn {
    background-color: #007acc;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 8px 20px;
    font-size: 14px;
    cursor: pointer;
}

.error-modal-btn:hover {
    background-color: #005a9e;
}
</style>
