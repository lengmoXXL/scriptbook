<script setup>
import { ref, onMounted } from 'vue'
import { listFiles, listSandboxFiles, getFileContent } from '../api/files.js'
import { parse } from 'smol-toml'

const files = ref([])
const loading = ref(true)
const error = ref(null)
const selectedFile = ref(null)
const expandedSandboxes = ref(new Set())
const sandboxFilesCache = ref(new Map())

const emit = defineEmits(['select'])

onMounted(async () => {
    await loadFiles()
})

async function loadFiles() {
    loading.value = true
    error.value = null

    try {
        files.value = await listFiles()
        if (files.value.length > 0) {
            const path = window.location.pathname
            const filename = path.startsWith('/') ? path.slice(1) : path
            if (filename && files.value.includes(filename)) {
                selectFile(filename)
            } else if (!selectedFile.value) {
                selectFile(files.value[0])
            }
        }
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

function isSandboxFile(filename) {
    return filename.toLowerCase().endsWith('.sandbox')
}

async function toggleSandbox(filename, event) {
    event.stopPropagation()
    if (expandedSandboxes.value.has(filename)) {
        expandedSandboxes.value.delete(filename)
    } else {
        expandedSandboxes.value.add(filename)
        await loadSandboxFiles(filename)
    }
}

async function loadSandboxFiles(filename) {
    try {
        const content = await getFileContent(filename)
        const parsed = parse(content)
        const sandboxConfig = parsed.sandbox || {}
        const sandboxId = sandboxConfig.sandbox_id || 'auto'

        const sandboxFileList = await listSandboxFiles(sandboxId)
        sandboxFilesCache.value.set(filename, sandboxFileList)
    } catch (err) {
        console.error('Error loading sandbox files:', err)
        sandboxFilesCache.value.set(filename, [])
    }
}

function isExpanded(filename) {
    return expandedSandboxes.value.has(filename)
}

function getSandboxFiles(filename) {
    return sandboxFilesCache.value.get(filename) || []
}

function selectSandboxFile(sandboxFile, sandboxFilename) {
    selectedFile.value = `${sandboxFilename}:${sandboxFile}`
    emit('select', `${sandboxFilename}:${sandboxFile}`)
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
                <div class="file-item" @click="selectFile(file)">
                    <span v-if="isSandboxFile(file)" class="expand-icon" @click="toggleSandbox(file, $event)">
                        {{ isExpanded(file) ? '▼' : '▶' }}
                    </span>
                    <span class="filename">{{ file }}</span>
                </div>
                <ul v-if="isSandboxFile(file) && isExpanded(file)" class="subfiles">
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

.expand-icon {
    cursor: pointer;
    user-select: none;
    font-size: 10px;
    width: 12px;
    display: inline-flex;
    justify-content: center;
}

.subfiles {
    list-style: none;
    margin: 0;
    padding: 0;
    background-color: #181818;
}

.subfiles li {
    padding: 8px 16px 8px 34px;
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
    padding-left: 31px;
}
</style>
