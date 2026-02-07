<script setup>
import { ref, computed } from 'vue'
import FileList from './FileList.vue'
import SandboxChat from './SandboxChat.vue'
import { getFileContent, getSandboxFileContent } from '../api/files.js'
import { parse } from 'smol-toml'

// State
const currentFile = ref(null)
const currentContent = ref('')
const loading = ref(false)
const error = ref('')

// Computed: get filename from currentFile (handles both string and object)
const currentFilename = computed(() => {
    return typeof currentFile.value === 'string' ? currentFile.value : currentFile.value?.filename || ''
})

// Resize state
const sidebarWidth = ref(250) // pixel

// When file is selected from FileList
async function onFileSelect(selection) {
    const filename = typeof selection === 'string' ? selection : selection.filename
    const currentFilename = typeof currentFile.value === 'string' ? currentFile.value : currentFile.value?.filename

    if (currentFilename === filename) {
        return // Already selected
    }

    currentFile.value = selection
    loading.value = true
    error.value = ''

    // Check if it's a sandbox internal file (format: sandboxFile.md:internal.md)
    if (filename.includes(':')) {
        await loadSandboxMarkdownFile(selection)
    } else {
        // All files are sandbox files now
        loading.value = false
    }
}

async function loadSandboxMarkdownFile(selection) {
    try {
        const filename = typeof selection === 'string' ? selection : selection.filename
        const [sandboxConfigFile, mdFile] = filename.split(':')

        // Use actual sandbox ID and docPath from FileList's cache if available
        let actualSandboxId
        let docPath = '/workspace'

        if (typeof selection === 'object') {
            actualSandboxId = selection.sandboxId
            docPath = selection.docPath || '/workspace'
        }

        // Fallback: parse config if we don't have the required info
        if (!actualSandboxId) {
            const configContent = await getFileContent(sandboxConfigFile)
            const parsed = parse(configContent)
            const sandboxConfig = parsed.sandbox || {}
            actualSandboxId = sandboxConfig.sandbox_id || 'auto'
            docPath = sandboxConfig.doc_path || '/workspace'
        }

        const content = await getSandboxFileContent(actualSandboxId, mdFile, docPath)
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
                                :config="currentFilename.includes(':') ? currentFilename.split(':')[0] : currentFilename"
                                :markdown-content="currentFilename.includes(':') ? currentContent : ''"
                                :markdown-loading="currentFilename.includes(':') ? loading : false"
                                :markdown-error="currentFilename.includes(':') ? error : ''"
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