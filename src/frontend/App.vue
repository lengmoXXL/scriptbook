<script setup>
import { ref, provide, onMounted, onUnmounted } from 'vue'
import { useErrorHandler } from './composables/useErrorHandler.js'
import TilingLayout from './components/TilingLayout.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import QuickOpen from './components/QuickOpen.vue'

// 全局错误处理器 - 通过 provide/inject 在所有组件中共享
const errorHandler = useErrorHandler()
provide('errorHandler', errorHandler)

// 文件选择处理 - 转发给 TilingLayout
const tilingLayoutRef = ref(null)

// 快速搜索面板状态
const showQuickOpen = ref(false)

function onFileSelect(selection) {
    // 布局文件特殊处理
    if (selection.filename.endsWith('.layout.json')) {
        tilingLayoutRef.value?.restoreLayout(selection.filename)
        return
    }
    tilingLayoutRef.value?.handleFileSelect(selection)
}

// Ctrl+P 快捷键
function handleKeydown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        showQuickOpen.value = true
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
    <div class="app">
        <!-- Error Banner -->
        <ErrorBanner />

        <!-- Main content area -->
        <div class="main-content">
            <TilingLayout ref="tilingLayoutRef" />
        </div>

        <!-- Quick Open Dialog -->
        <QuickOpen
            :visible="showQuickOpen"
            @select="onFileSelect"
            @close="showQuickOpen = false"
        />
    </div>
</template>

<style>
/* 全局滚动条样式 */
::-webkit-scrollbar {
    width: 6px;
    height: 6px;
}

::-webkit-scrollbar-track {
    background: transparent;
}

::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
    background: #666;
}
</style>

<style scoped>
.app {
    display: flex;
    height: 100vh;
    width: 100vw;
    margin: 0;
    padding: 0;
    overflow: hidden;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

.main-content {
    flex: 1;
    position: relative;
    overflow: hidden;
}
</style>
