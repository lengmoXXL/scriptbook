<script setup>
import { ref, computed, provide } from 'vue'
import { useErrorHandler } from './composables/useErrorHandler.js'
import TilingLayout from './components/TilingLayout.vue'
import FileList from './components/FileList.vue'
import ErrorBanner from './components/ErrorBanner.vue'

// 全局错误处理器 - 通过 provide/inject 在所有组件中共享
const errorHandler = useErrorHandler()
provide('errorHandler', errorHandler)

// 文件选择处理 - 转发给 TilingLayout
const tilingLayoutRef = ref(null)

function onFileSelect(selection) {
    tilingLayoutRef.value?.handleFileSelect(selection)
}

// 已打开的文件列表
const openMdFiles = computed(() => tilingLayoutRef.value?.openMdFiles || [])
const openTerminalFiles = computed(() => tilingLayoutRef.value?.openTerminalFiles || [])
</script>

<template>
    <div class="app">
        <!-- Error Banner -->
        <ErrorBanner />

        <!-- Sidebar -->
        <div class="sidebar">
            <FileList
                :open-md-files="openMdFiles"
                :open-terminal-files="openTerminalFiles"
                @select="onFileSelect"
            />
        </div>

        <!-- Main content area -->
        <div class="main-content">
            <TilingLayout ref="tilingLayoutRef" />
        </div>
    </div>
</template>

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

.sidebar {
    width: 250px;
    height: 100%;
    background-color: #1e1e1e;
    border-right: 1px solid #333;
    flex-shrink: 0;
}

.main-content {
    flex: 1;
    position: relative;
    overflow: hidden;
}
</style>
