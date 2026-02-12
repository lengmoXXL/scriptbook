<script setup>
import { ref, computed, nextTick, onMounted, watch } from 'vue'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { getSandboxFileContent } from '../api/files.js'

const props = defineProps({
    sandboxId: {
        type: String,
        required: true
    },
    docPath: {
        type: String,
        default: '/workspace'
    },
    initialMdFile: {
        type: String,
        default: ''
    }
})

const currentMdFile = ref('')
const currentContent = ref('')
const loading = ref(false)
const error = ref('')
const terminalVisible = ref(false)
const terminalHeight = ref(300)
const isResizingTerminal = ref(false)

const terminalRef = ref(null)

const wsUrl = computed(() => {
    const backendHost = import.meta.env.DEV ? 'localhost:8080' : window.location.host
    return `ws://${backendHost}/ws/${props.sandboxId}`
})

async function loadMarkdownFile(mdFile) {
    if (!mdFile) {
        currentMdFile.value = ''
        currentContent.value = ''
        return
    }

    if (mdFile === currentMdFile.value) {
        return
    }

    currentMdFile.value = mdFile
    loading.value = true
    error.value = ''

    try {
        const content = await getSandboxFileContent(props.sandboxId, mdFile, props.docPath)
        currentContent.value = content
    } catch (err) {
        error.value = err.message || 'Failed to load file'
        console.error('Error loading file:', err)
    } finally {
        loading.value = false
    }
}

function onExecuteCommand(command) {
    if (!terminalVisible.value) {
        terminalVisible.value = true
    }
    nextTick(() => {
        if (terminalRef.value) {
            terminalRef.value.sendCommand(command)
        }
    })
}

function toggleTerminal() {
    terminalVisible.value = !terminalVisible.value
}

function startTerminalResize(event) {
    isResizingTerminal.value = true
    const startY = event.clientY
    const startHeight = terminalHeight.value

    function onMouseMove(e) {
        if (!isResizingTerminal.value) return
        const deltaY = e.clientY - startY
        let newHeight = startHeight - deltaY
        newHeight = Math.max(100, Math.min(600, newHeight))
        terminalHeight.value = newHeight
    }

    function onMouseUp() {
        isResizingTerminal.value = false
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
}

defineExpose({ loadMarkdownFile })

onMounted(() => {
    if (props.initialMdFile) {
        loadMarkdownFile(props.initialMdFile)
    }
})

watch(() => props.initialMdFile, (newMdFile) => {
    if (newMdFile && newMdFile !== currentMdFile.value) {
        loadMarkdownFile(newMdFile)
    }
})
</script>

<template>
    <div class="sandbox">
        <div class="sandbox-content">
            <div v-if="!currentMdFile && !loading && !error" class="empty-state">
                <p>Select a markdown file from the sidebar to view content</p>
            </div>
            <div v-else-if="loading" class="loading-state">Loading...</div>
            <div v-else-if="error" class="error-state">{{ error }}</div>
            <MarkdownViewer
                v-else
                :content="currentContent"
                :on-execute-command="onExecuteCommand"
            />
        </div>
        <div class="resize-area-wrapper">
            <div class="terminal-resize-area" @mousedown="startTerminalResize">
                <button class="terminal-toggle-btn" @click="toggleTerminal">
                    Terminal
                    <span class="toggle-icon">{{ terminalVisible ? '▼' : '▲' }}</span>
                </button>
                <template v-if="terminalVisible">
                    <span class="terminal-id">{{ sandboxId }}</span>
                </template>
            </div>
        </div>
        <div v-if="terminalVisible" class="terminal-panel" :style="{ height: `${terminalHeight}px` }">
            <div class="terminal-body">
                <Terminal ref="terminalRef" :ws-url="wsUrl" />
            </div>
        </div>
    </div>
</template>

<style scoped>
.sandbox {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
}

.sandbox-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
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
    color: #888;
}

.resize-area-wrapper {
    position: relative;
    height: 28px;
    flex-shrink: 0;
}

.terminal-resize-area {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 100%;
    cursor: row-resize;
    z-index: 10;
    display: flex;
    align-items: center;
    background-color: #2a2a2a;
    border-top: 1px solid #444;
    border-bottom: 1px solid #444;
    padding: 0 12px;
}

.terminal-resize-area:hover {
    background-color: #3a3a3a;
}

.terminal-toggle-btn {
    background: transparent;
    color: #888;
    border: none;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 0.2s;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 500;
}

.terminal-toggle-btn:hover {
    color: #f0f0f0;
}

.terminal-id {
    color: #888;
    font-size: 11px;
    margin-left: auto;
}

.toggle-icon {
    font-size: 10px;
}

.terminal-panel {
    display: flex;
    flex-direction: column;
    background-color: #1e1e1e;
    position: relative;
}

.terminal-body {
    flex: 1;
    overflow: hidden;
}
</style>
