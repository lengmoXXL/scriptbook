<script setup>
import { ref, onMounted } from 'vue'
import { listFiles, listSandboxFiles, getFileContent } from '../api/files.js'
import { createSandbox } from '../api/sandbox.js'
import { parse } from 'smol-toml'

const files = ref([])
const loading = ref(true)
const error = ref(null)
const selectedFile = ref(null)
const expandedSandboxes = ref(new Set())
const sandboxFilesCache = ref(new Map())
// Cache actual sandbox IDs for config files
const sandboxIdCache = ref(new Map())
// Cache doc_path for sandbox configs
const sandboxDocPathCache = ref(new Map())
// Track sandbox status: 'pending' | 'creating' | 'ready' | 'error'
const sandboxStatusCache = ref(new Map())
// Track sandbox errors
const sandboxErrorCache = ref(new Map())

const emit = defineEmits(['select'])

onMounted(async () => {
    await loadFiles()
})

async function loadFiles() {
    loading.value = true
    error.value = null

    try {
        files.value = await listFiles()
        // Don't auto-select any file - wait for user to click
    } catch (err) {
        error.value = err.message || 'Failed to load files'
        console.error('Error loading files:', err)
    } finally {
        loading.value = false
    }
}

function selectFile(filename) {
    selectedFile.value = filename
    emit('select', filename)
}

async function handleFileClick(file) {
    // Always select the file
    selectFile(file)

    // If it's a sandbox file, also toggle expansion
    if (isSandboxFile(file) && !isSandboxCreating(file)) {
        if (expandedSandboxes.value.has(file)) {
            expandedSandboxes.value.delete(file)
        } else {
            expandedSandboxes.value.add(file)
            await loadSandboxFiles(file)
        }
    }
}

function isSandboxFile(filename) {
    return filename.toLowerCase().endsWith('.sandbox')
}

async function loadSandboxFiles(filename) {
    const existingStatus = sandboxStatusCache.value.get(filename)
    if (existingStatus === 'ready') {
        return
    }

    sandboxStatusCache.value.set(filename, 'creating')
    sandboxErrorCache.value.delete(filename)

    try {
        const content = await getFileContent(filename)
        const parsed = parse(content)
        const sandboxConfig = parsed.sandbox || {}

        // Cache doc_path for later use
        const docPath = sandboxConfig.doc_path || '/workspace'
        sandboxDocPathCache.value.set(filename, docPath)

        let actualSandboxId = sandboxIdCache.value.get(filename)
        if (!actualSandboxId) {
            const provider = sandboxConfig.provider || 'local_docker'
            const sandboxId = sandboxConfig.sandbox_id || 'auto'

            const result = await createSandbox({
                provider,
                sandbox_id: sandboxId,
                image: sandboxConfig.image,
                init_commands: sandboxConfig.init_commands,
                env: parsed.env || {},
                expire_time: sandboxConfig.expire_time,
                type: sandboxConfig.type
            })
            actualSandboxId = result.id
            sandboxIdCache.value.set(filename, actualSandboxId)
        }

        const sandboxFileList = await listSandboxFiles(actualSandboxId, docPath)
        sandboxFilesCache.value.set(filename, sandboxFileList)
        sandboxStatusCache.value.set(filename, 'ready')
    } catch (err) {
        console.error('Error loading sandbox files:', err)
        sandboxStatusCache.value.set(filename, 'error')
        sandboxErrorCache.value.set(filename, err.message || 'Failed to create sandbox')
        sandboxFilesCache.value.set(filename, [])
    }
}

function isExpanded(filename) {
    return expandedSandboxes.value.has(filename)
}

function getSandboxFiles(filename) {
    return sandboxFilesCache.value.get(filename) || []
}

function getSandboxStatus(filename) {
    return sandboxStatusCache.value.get(filename) || 'pending'
}

function getSandboxError(filename) {
    return sandboxErrorCache.value.get(filename)
}

function getSandboxId(filename) {
    return sandboxIdCache.value.get(filename)
}

function isSandboxReady(filename) {
    return getSandboxStatus(filename) === 'ready'
}

function isSandboxCreating(filename) {
    return getSandboxStatus(filename) === 'creating'
}

function isSandboxError(filename) {
    return getSandboxStatus(filename) === 'error'
}

function getStatusClass(filename) {
    const status = getSandboxStatus(filename)
    if (status === 'creating') return 'status-creating'
    if (status === 'ready') return 'status-ready'
    if (status === 'error') return 'status-error'
    return ''
}

function getStatusTitle(filename) {
    const status = getSandboxStatus(filename)
    if (status === 'creating') return 'Creating sandbox...'
    if (status === 'ready') {
        const sandboxId = getSandboxId(filename)
        return `Ready: ${sandboxId}`
    }
    if (status === 'error') {
        const error = getSandboxError(filename)
        return `Error: ${error}`
    }
    return 'Not initialized'
}

function selectSandboxFile(sandboxFile, sandboxFilename) {
    selectedFile.value = `${sandboxFilename}:${sandboxFile}`
    const actualSandboxId = sandboxIdCache.value.get(sandboxFilename)
    const docPath = sandboxDocPathCache.value.get(sandboxFilename) || '/workspace'
    emit('select', { filename: `${sandboxFilename}:${sandboxFile}`, sandboxId: actualSandboxId, docPath })
}

function refreshFiles() {
    loadFiles()
}
</script>

<template>
    <div class="file-list">
        <div class="file-list-header">
            <h3>Markdown Files</h3>
            <button @click="refreshFiles" :disabled="loading" class="refresh-btn">
                {{ loading ? 'Loading...' : 'Refresh' }}
            </button>
        </div>

        <div v-if="loading" class="loading">
            Loading files...
        </div>

        <div v-else-if="error" class="error">
            <p>{{ error }}</p>
            <button @click="refreshFiles">Retry</button>
        </div>

        <div v-else-if="files.length === 0" class="empty">
            No markdown files found in directory.
        </div>

        <ul v-else class="files">
            <li v-for="file in files"
                :key="file"
                :class="{ selected: selectedFile === file }">
                <div class="file-item" @click="handleFileClick(file)">
                    <span class="filename">{{ file }}</span>
                    <span v-if="isSandboxFile(file)" class="status-dot" :class="getStatusClass(file)" :title="getStatusTitle(file)">
                        <span class="dot"></span>
                    </span>
                </div>
                <ul v-if="isSandboxFile(file) && isExpanded(file) && isSandboxReady(file)" class="subfiles">
                    <li v-for="subfile in getSandboxFiles(file)"
                        :key="subfile"
                        :class="{ selected: selectedFile === `${file}:${subfile}` }"
                        @click="selectSandboxFile(subfile, file)">
                        {{ subfile }}
                    </li>
                </ul>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.file-list {
    height: 100%;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #444;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

.file-list-header {
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid #444;
    background-color: #252525;
}

.file-list-header h3 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}

.refresh-btn {
    padding: 4px 8px;
    font-size: 12px;
    background-color: #333;
    color: #f0f0f0;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
}

.refresh-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.refresh-btn:hover:not(:disabled) {
    background-color: #444;
}

.loading, .error, .empty {
    padding: 20px;
    text-align: center;
    color: #999;
}

.error {
    color: #ff6b6b;
}

.error button {
    margin-top: 10px;
    padding: 6px 12px;
    background-color: #444;
    color: #f0f0f0;
    border: none;
    border-radius: 3px;
    cursor: pointer;
}

.files {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    overflow-y: auto;
}

.files > li {
    border-bottom: 1px solid #333;
}

.file-item {
    padding: 10px 16px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
}

.file-item:hover {
    background-color: #2a2a2a;
}

.files > li:not(:has(.subfiles)) .file-item.selected,
.files > li:has(.subfiles) .file-item:has(~ .subfiles li.selected) {
    background-color: #333;
}

.subfiles {
    list-style: none;
    margin: 0;
    padding: 0;
    background-color: #181818;
}

.subfiles li {
    padding: 8px 16px 8px 24px;
    cursor: pointer;
    border-bottom: 1px solid #2a2a2a;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 12px;
    color: #ccc;
}

.subfiles li:hover {
    background-color: #222;
}

.subfiles li.selected {
    background-color: #333;
    border-left: 3px solid #00ff00;
    padding-left: 21px;
}

.status-dot {
    margin-left: auto;
    display: flex;
    align-items: center;
    cursor: help;
}

.status-dot .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.status-creating .dot {
    background-color: #ffa500;
    animation: pulse 1.5s ease-in-out infinite;
}

.status-ready .dot {
    background-color: #00ff00;
}

.status-error .dot {
    background-color: #ff6b6b;
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
}
</style>
