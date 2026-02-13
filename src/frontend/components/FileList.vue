<script setup>
import { ref, onMounted, computed } from 'vue'
import { listFiles } from '../api/files.js'

const files = ref([])
const loading = ref(true)
const error = ref(null)
const selectedFile = ref(null)

const emit = defineEmits(['select'])

const markdownFiles = computed(() => {
    return files.value
        .filter(f => f.toLowerCase().endsWith('.md') && !f.toLowerCase().endsWith('.tl'))
        .sort()
})

const sandboxFiles = computed(() => {
    const tlFiles = files.value
        .filter(f => f.toLowerCase().endsWith('.tl'))
        .sort()
    // Always include default.tl (built-in terminal)
    if (!tlFiles.includes('default.tl')) {
        return ['default.tl', ...tlFiles]
    }
    return tlFiles
})

onMounted(async () => {
    await loadFiles()
})

async function loadFiles() {
    loading.value = true
    error.value = null

    try {
        files.value = await listFiles()
    } catch (err) {
        error.value = err.message || 'Failed to load files'
        console.error('Error loading files:', err)
    } finally {
        loading.value = false
    }
}

async function handleFileClick(file) {
    selectedFile.value = file

    // Local markdown file
    if (file.toLowerCase().endsWith('.md') && !file.toLowerCase().endsWith('.tl')) {
        emit('select', { filename: file, isLocal: true })
        return
    }

    // Sandbox config file - emit filename directly
    if (file.toLowerCase().endsWith('.tl')) {
        emit('select', { filename: file })
    }
}

function refreshFiles() {
    loadFiles()
}
</script>

<template>
    <div class="file-list">
        <div class="file-list-header">
            <h3>Files</h3>
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
            No files found in directory.
        </div>

        <div v-else class="panels">
            <!-- Markdown files panel -->
            <div class="panel">
                <div class="panel-header">Markdown</div>
                <ul v-if="markdownFiles.length > 0" class="files">
                    <li v-for="file in markdownFiles"
                        :key="file"
                        :class="{ selected: selectedFile === file }">
                        <div class="file-item" @click="handleFileClick(file)">
                            <span class="filename">{{ file }}</span>
                        </div>
                    </li>
                </ul>
                <div v-else class="panel-empty">No markdown files</div>
            </div>

            <!-- Sandbox files panel -->
            <div class="panel">
                <div class="panel-header">Terminal</div>
                <ul v-if="sandboxFiles.length > 0" class="files">
                    <li v-for="file in sandboxFiles"
                        :key="file"
                        :class="{ selected: selectedFile === file }">
                        <div class="file-item" @click="handleFileClick(file)">
                            <span class="filename">{{ file }}</span>
                        </div>
                    </li>
                </ul>
                <div v-else class="panel-empty">No terminal configs</div>
            </div>
        </div>
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

.panels {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.panel {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #444;
    min-height: 0;
}

.panel:last-child {
    border-bottom: none;
}

.panel-header {
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 600;
    color: #888;
    background-color: #1a1a1a;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

.panel-empty {
    padding: 20px;
    text-align: center;
    color: #666;
    font-size: 12px;
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

.files > li .file-item.selected {
    background-color: #333;
}
</style>
