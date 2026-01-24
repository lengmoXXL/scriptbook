<script setup>
import { ref, onMounted } from 'vue'
import { listFiles } from '../api/files.js'

const files = ref([])
const loading = ref(true)
const error = ref(null)
const selectedFile = ref(null)

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
            if (!selectedFile.value) {
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
                :class="{ selected: selectedFile === file }"
                @click="selectFile(file)">
                {{ file }}
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

.files li {
    padding: 10px 16px;
    cursor: pointer;
    border-bottom: 1px solid #333;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    font-size: 13px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.files li:hover {
    background-color: #2a2a2a;
}

.files li.selected {
    background-color: #333;
    border-left: 3px solid #00ff00;
    padding-left: 13px;
}
</style>