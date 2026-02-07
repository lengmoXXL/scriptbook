<script setup>
import { ref } from 'vue'
import FileList from './FileList.vue'
import SandboxChat from './SandboxChat.vue'
import { getFileContent, getSandboxFileContent } from '../api/files.js'
import { parse } from 'smol-toml'

// State
const currentFile = ref(null)
const currentContent = ref('')
const loading = ref(false)
const error = ref('')

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

    // Check if it's a sandbox internal file (format: sandboxFile.md:internal.md)
    if (filename.includes(':')) {
        await loadSandboxMarkdownFile(filename)
    } else {
        // All files are sandbox files now
        loading.value = false
    }
}

async function loadSandboxMarkdownFile(filename) {
    try {
        const [sandboxConfigFile, mdFile] = filename.split(':')
        const configContent = await getFileContent(sandboxConfigFile)
        const parsed = parse(configContent)
        const sandboxConfig = parsed.sandbox || {}
        const sandboxId = sandboxConfig.sandbox_id || 'auto'

        const content = await getSandboxFileContent(sandboxId, mdFile)
        currentContent.value = content
    } catch (err) {
        error.value = err.message || 'Failed to load sandbox file'
        console.error('Error loading sandbox file:', err)
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
            <div class="content">
                <div class="split-layout">
                    <template v-if="currentFile">
                        <div class="sandbox-section-full">
                            <SandboxChat
                                :config="currentFile.includes(':') ? currentFile.split(':')[0] : currentFile"
                                :markdown-content="currentFile.includes(':') ? currentContent : ''"
                                :markdown-loading="currentFile.includes(':') ? loading : false"
                                :markdown-error="currentFile.includes(':') ? error : ''"
                            />
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

.sandbox-section-full {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
}
</style>