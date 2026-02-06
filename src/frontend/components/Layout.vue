<script setup>
import { ref } from 'vue'
import FileList from './FileList.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import SandboxChat from './SandboxChat.vue'
import { getFileContent } from '../api/files.js'

// State
const currentFile = ref(null)
const currentContent = ref('')
const loading = ref(false)
const error = ref('')
const currentView = ref('markdown') // 'markdown' or 'sandbox'

// Resize state
const sidebarWidth = ref(250) // pixel

// When file is selected from FileList
async function onFileSelect(filename) {
    if (currentFile.value === filename) {
        return // Already selected
    }

    currentFile.value = filename
    loading.value = true
    error.value = ''

    // Determine view type based on file extension
    if (filename.toLowerCase().endsWith('.sandbox')) {
        currentView.value = 'sandbox'
    } else {
        currentView.value = 'markdown'
    }

    try {
        const content = await getFileContent(filename)
        currentContent.value = content
    } catch (err) {
        error.value = err.message || 'Failed to load file'
        console.error('Error loading file:', err)
    } finally {
        loading.value = false
    }
}

// Sidebar width resize
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

</script>

<template>
    <div class="layout">
        <div class="sidebar" :style="{ width: sidebarWidth + 'px' }">
            <FileList @select="onFileSelect" />
        </div>
        <div class="sidebar-resizer" @mousedown="startSidebarResize"></div>
        <div class="main">
            <div class="header">
                <div class="header-left">
                    <div class="file-info" v-if="currentFile">
                        <span class="filename">{{ currentFile }}</span>
                        <span v-if="loading" class="loading-indicator">Loading...</span>
                    </div>
                </div>
            </div>
            <div class="content">
                <div class="split-layout">
                    <template v-if="currentView === 'markdown'">
                        <div class="markdown-section">
                            <MarkdownViewer
                                :content="currentContent"
                                :loading="loading"
                                :error="error"
                            />
                        </div>
                    </template>
                    <template v-else-if="currentView === 'sandbox'">
                        <div class="sandbox-section-full">
                            <SandboxChat :config="currentFile" />
                        </div>
                    </template>
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
    border-left: 1px solid #444;
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

.header {
    padding: 12px 20px;
    border-bottom: 1px solid #444;
    background-color: #252525;
    display: flex;
    align-items: center;
    justify-content: flex-start;
}


.file-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 13px;
    color: #aaa;
}

.filename {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    background-color: #333;
    padding: 4px 8px;
    border-radius: 3px;
}

.loading-indicator {
    color: #00ff00;
    font-style: italic;
}

.content {
    flex: 1;
    overflow: hidden;
}

.split-layout {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
}

.markdown-section {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 20px;
}

.sandbox-section-full {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* Header layout */
.header {
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.header-left,
.header-right {
    display: flex;
    align-items: center;
}

.view-toggle {
    display: flex;
    gap: 8px;
}

.toggle-button {
    background-color: #333;
    color: #aaa;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.2s;
}

.toggle-button:hover {
    background-color: #3a3a3a;
    color: #fff;
}

.toggle-button.active {
    background-color: #00a67d;
    color: white;
    border-color: #00a67d;
}

.toggle-button.active:hover {
    background-color: #008f6b;
}
</style>