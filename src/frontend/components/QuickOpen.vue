<script setup>
import { ref, computed, watch, onMounted, onUnmounted, inject } from 'vue'
import { listFiles } from '../api/files.js'

const props = defineProps({
    visible: Boolean
})

const emit = defineEmits(['select', 'close'])

const errorHandler = inject('errorHandler')

const searchQuery = ref('')
const files = ref([])
const selectedIndex = ref(0)

const filteredFiles = computed(() => {
    const query = searchQuery.value.toLowerCase()

    const layouts = files.value.filter(f => f.toLowerCase().endsWith('.layout.json')).sort()
    const markdowns = files.value.filter(f => f.toLowerCase().endsWith('.md') && !f.toLowerCase().endsWith('.tl') && !f.toLowerCase().endsWith('.layout.json')).sort()
    const terminals = files.value.filter(f => f.toLowerCase().endsWith('.tl') && !f.toLowerCase().endsWith('.layout.json')).sort()

    // 按类型排序：布局 > Markdown > 终端
    const allFiles = [...layouts, ...markdowns, ...terminals]

    if (!query) return allFiles

    return allFiles.filter(f => f.toLowerCase().includes(query))
})

watch(() => props.visible, (visible) => {
    if (visible) {
        searchQuery.value = ''
        selectedIndex.value = 0
        loadFiles()
        // Focus input after DOM update
        setTimeout(() => {
            document.getElementById('quick-open-input')?.focus()
        }, 0)
    }
})

watch(searchQuery, () => {
    selectedIndex.value = 0
})

async function loadFiles() {
    try {
        files.value = await listFiles()
    } catch (err) {
        errorHandler.showError(`获取文件列表失败: ${err.message}`)
    }
}

function handleKeydown(e) {
    if (!props.visible) return

    switch (e.key) {
        case 'Escape':
            emit('close')
            break
        case 'ArrowDown':
            e.preventDefault()
            selectedIndex.value = Math.min(selectedIndex.value + 1, filteredFiles.value.length - 1)
            break
        case 'ArrowUp':
            e.preventDefault()
            selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
            break
        case 'Enter':
            e.preventDefault()
            if (e.ctrlKey || e.metaKey) {
                selectFile(filteredFiles.value[selectedIndex.value], 'horizontal')
            } else if (e.altKey) {
                selectFile(filteredFiles.value[selectedIndex.value], 'vertical')
            } else {
                selectFile(filteredFiles.value[selectedIndex.value])
            }
            break
    }
}

function selectFile(file, splitDirection = null) {
    if (!file) return
    const isLayout = file.toLowerCase().endsWith('.layout.json')
    const isLocal = isLayout || (file.toLowerCase().endsWith('.md') && !file.toLowerCase().endsWith('.tl'))
    emit('select', { filename: file, isLocal, splitDirection })
    emit('close')
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <Teleport to="body">
        <div v-if="visible" class="quick-open-overlay" @click.self="$emit('close')">
            <div class="quick-open-dialog">
                <div class="quick-open-input-wrapper">
                    <input
                        id="quick-open-input"
                        v-model="searchQuery"
                        type="text"
                        placeholder="Search files..."
                        class="quick-open-input"
                    />
                </div>
                <div class="quick-open-list">
                    <div
                        v-for="(file, index) in filteredFiles"
                        :key="file"
                        class="quick-open-item"
                        :class="{ selected: index === selectedIndex }"
                        @click="selectFile(file)"
                        @mouseenter="selectedIndex = index"
                    >
                        <span class="file-icon" :class="{ terminal: file.endsWith('.tl'), layout: file.endsWith('.layout.json') }">
                            <template v-if="file.endsWith('.layout.json')">📁</template>
                            <template v-else-if="file.endsWith('.tl')">⌘</template>
                            <template v-else>📄</template>
                        </span>
                        <span class="file-name">{{ file }}</span>
                        <div class="split-actions">
                            <button
                                class="split-btn"
                                title="Split Right (Ctrl+Enter)"
                                @click.stop="selectFile(file, 'horizontal')"
                            >→</button>
                            <button
                                class="split-btn"
                                title="Split Down (Alt+Enter)"
                                @click.stop="selectFile(file, 'vertical')"
                            >↓</button>
                        </div>
                    </div>
                    <div v-if="filteredFiles.length === 0" class="quick-open-empty">
                        No files found
                    </div>
                </div>
                <div class="quick-open-footer">
                    <span>Enter: Open</span>
                    <span>Ctrl+Enter: Split Right</span>
                    <span>Alt+Enter: Split Down</span>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.quick-open-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
}

.quick-open-dialog {
    width: 520px;
    max-height: 420px;
    background-color: #252526;
    border: 1px solid #454545;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    overflow: hidden;
}

.quick-open-input-wrapper {
    padding: 12px;
    border-bottom: 1px solid #454545;
}

.quick-open-input {
    width: 100%;
    padding: 10px 14px;
    font-size: 14px;
    background-color: #3c3c3c;
    border: 1px solid #454545;
    border-radius: 6px;
    color: #f0f0f0;
    outline: none;
    box-sizing: border-box;
}

.quick-open-input:focus {
    border-color: #007acc;
}

.quick-open-input::placeholder {
    color: #888;
}

.quick-open-list {
    max-height: 320px;
    overflow-y: auto;
    padding: 4px 0;
}

.quick-open-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
    font-size: 13px;
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    position: relative;
}

.quick-open-item:hover,
.quick-open-item.selected {
    background-color: #094771;
}

.file-icon {
    font-size: 14px;
    opacity: 0.8;
    width: 20px;
    text-align: center;
    flex-shrink: 0;
}

.file-icon.terminal {
    opacity: 1;
}

.file-name {
    color: #f0f0f0;
}

.quick-open-empty {
    padding: 20px;
    text-align: center;
    color: #888;
}

.split-actions {
    display: none;
    position: absolute;
    right: 12px;
    gap: 4px;
}

.quick-open-item:hover .split-actions,
.quick-open-item.selected .split-actions {
    display: flex;
}

.split-btn {
    width: 24px;
    height: 24px;
    border: 1px solid #555;
    background-color: #333;
    color: #aaa;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.split-btn:hover {
    background-color: #007acc;
    border-color: #007acc;
    color: #fff;
}

.quick-open-footer {
    padding: 10px 16px;
    border-top: 1px solid #454545;
    font-size: 11px;
    color: #888;
    display: flex;
    gap: 16px;
}
</style>
