<script setup>
import { ref } from 'vue'
import FileList from './FileList.vue'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { getFileContent } from '../api/files.js'

// State
const currentFile = ref(null)
const currentContent = ref('')
const loading = ref(false)
const error = ref('')

// Refs
const terminalRef = ref(null)

// When file is selected from FileList
async function onFileSelect(filename) {
    if (currentFile.value === filename) {
        return // Already selected
    }

    currentFile.value = filename
    loading.value = true
    error.value = ''

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

function handleExecuteCommand(command) {
    if (terminalRef.value && terminalRef.value.sendCommand) {
        terminalRef.value.sendCommand(command)
    } else {
        console.warn('Terminal ref not available or sendCommand method not found')
    }
}

</script>

<template>
    <div class="layout">
        <div class="sidebar">
            <FileList @select="onFileSelect" />
        </div>
        <div class="main">
            <div class="header">
                <div class="file-info" v-if="currentFile">
                    <span class="filename">{{ currentFile }}</span>
                    <span v-if="loading" class="loading-indicator">Loading...</span>
                </div>
            </div>
            <div class="content">
                <div class="split-layout">
                    <div class="markdown-section">
                        <MarkdownViewer
                            :content="currentContent"
                            :loading="loading"
                            :error="error"
                            @executeCommand="handleExecuteCommand"
                        />
                    </div>
                    <div class="terminal-section">
                        <Terminal ref="terminalRef" />
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
    width: 300px;
    min-width: 250px;
    max-width: 400px;
    height: 100%;
    border-right: 1px solid #444;
    background-color: #1e1e1e;
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
}

.terminal-section {
    flex: 0 0 40%;
    overflow: hidden;
    position: relative;
    border-top: 1px solid #444;
}
</style>