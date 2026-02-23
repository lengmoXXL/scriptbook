<script setup>
import { ref, computed, onUnmounted, inject } from 'vue'
import { useTilingLayout } from '../composables/useTilingLayout.js'
import { useMarkdownContent } from '../composables/useMarkdownContent.js'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { CONFIG } from '../config.js'

// 注入全局错误处理器
const errorHandler = inject('errorHandler')

// Terminal refs (keyed by windowId)
const terminalRefs = {}

// 平铺布局管理
const tilingLayout = useTilingLayout()

// Markdown 内容管理
const mdContent = useMarkdownContent(errorHandler)

// 容器引用
const containerRef = ref(null)

// 分割线状态
const resizingDivider = ref(null)
const containerSize = ref({ width: 0, height: 0 })

// 更新容器尺寸
function updateContainerSize() {
    if (containerRef.value) {
        const rect = containerRef.value.getBoundingClientRect()
        containerSize.value = { width: rect.width, height: rect.height }
    }
}

// 计算布局
const windowLayouts = computed(() => {
    if (!containerRef.value) return []
    updateContainerSize()
    return tilingLayout.calculateLayout(tilingLayout.rootContainer.value, {
        x: 0,
        y: 0,
        width: containerSize.value.width,
        height: containerSize.value.height
    })
})

// 计算分割线位置
const dividers = computed(() => {
    const results = []
    if (!tilingLayout.rootContainer.value) return results

    function collectDividers(container, parentRect) {
        if (!container || container.type === 'window') return

        if (container.type === 'split' && container.children) {
            const isHorizontal = container.layout === 'horizontal'
            let offset = 0
            const totalFlex = container.children.reduce((sum, child) => sum + (child.flex || 1), 0)

            for (let i = 0; i < container.children.length; i++) {
                const child = container.children[i]
                const childFlex = child.flex || 1
                const childRatio = childFlex / totalFlex

                const childRect = isHorizontal
                    ? {
                        x: parentRect.x + offset,
                        y: parentRect.y,
                        width: parentRect.width * childRatio,
                        height: parentRect.height
                    }
                    : {
                        x: parentRect.x,
                        y: parentRect.y + offset,
                        width: parentRect.width,
                        height: parentRect.height * childRatio
                    }

                if (i > 0) {
                    const dividerThickness = 4
                    const prevWindowId = container.children[i - 1].id
                    results.push({
                        id: `divider-${container.id}-${i}`,
                        layout: container.layout,
                        position: isHorizontal
                            ? { x: parentRect.x + offset - dividerThickness / 2, y: parentRect.y, width: dividerThickness, height: parentRect.height }
                            : { x: parentRect.x, y: parentRect.y + offset - dividerThickness / 2, width: parentRect.width, height: dividerThickness },
                        targetWindowId: prevWindowId,
                        splitContainer: container
                    })
                }

                offset += isHorizontal ? childRect.width : childRect.height

                collectDividers(child, childRect)
            }
        }
    }

    collectDividers(tilingLayout.rootContainer.value, {
        x: 0,
        y: 0,
        width: containerSize.value.width,
        height: containerSize.value.height
    })

    return results
})

// 获取窗口样式
function getWindowStyle(layout) {
    return {
        position: 'absolute',
        left: layout.x + 'px',
        top: layout.y + 'px',
        width: layout.width + 'px',
        height: layout.height + 'px'
    }
}

// 打开 Markdown 窗口
function openMarkdownWindow(filename) {
    const windowId = tilingLayout.openWindow({
        type: 'markdown',
        filename
    })
    mdContent.loadContent(windowId, filename)
    return windowId
}

// 打开 Terminal 窗口
function openTerminalWindow(filename) {
    const windowId = tilingLayout.openWindow({
        type: 'terminal',
        filename
    })

    return windowId
}

// 关闭窗口
function closeWindow(windowId) {
    const layout = windowLayouts.value.find(l => l.id === windowId)
    if (layout?.window.type === 'markdown') {
        mdContent.clearContent(windowId)
    }
    tilingLayout.closeWindow(windowId)
}

// 获取 Terminal 引用
function getTerminalRef(key) {
    return terminalRefs[key]
}

function setTerminalRef(key, el) {
    terminalRefs[key] = el
}

function getWsUrl(filename, windowId) {
    const host = import.meta.env.DEV
        ? CONFIG.api.devBase.replace('http://', '').replace('/api', '')
        : window.location.host
    return `ws://${host}/ws/${filename}/${windowId}`
}

// 文件选择处理（供 App 组件调用）
function handleFileSelect(selection) {
    if (selection.isLocal) {
        openMarkdownWindow(selection.filename)
    } else {
        const windowId = openTerminalWindow(selection.filename)
        setTimeout(() => {
            const terminalRef = getTerminalRef(windowId)
            if (terminalRef) {
                terminalRef.focus()
            }
        }, 50)
    }
}

// 窗口聚焦处理
function onWindowFocus(windowId) {
    tilingLayout.focusWindowById(windowId)
}

// 分割指定窗口
function splitWindow(direction, windowId) {
    tilingLayout.focusWindowById(windowId)
    const splitInfo = tilingLayout.splitWindow(direction)
    if (!splitInfo) return

    const { sourceWindow } = splitInfo

    const newWindowId = tilingLayout.createWindowInSplit(splitInfo, {
        type: sourceWindow.type,
        filename: sourceWindow.filename
    })

    if (newWindowId && sourceWindow.type === 'markdown') {
        mdContent.loadContent(newWindowId, sourceWindow.filename)
    }
}

// 在所有 Terminal 中执行命令
function executeCommandInAllTerminals(command) {
    const terminals = Object.values(terminalRefs).filter(ref => ref && typeof ref.sendCommand === 'function')
    for (const terminal of terminals) {
        terminal.sendCommand(command)
    }
}

// 处理拖动开始
function handleDividerMouseDown(e, divider) {
    e.preventDefault()
    e.stopPropagation()

    const rect = containerRef.value.getBoundingClientRect()
    const containerSize = divider.layout === 'horizontal' ? rect.width : rect.height

    const result = tilingLayout.getSplitContainerForWindow(divider.targetWindowId, divider.layout)
    if (!result) return

    const { splitNode, windowIndex } = result
    const targetWindow = splitNode.children[windowIndex]
    const totalFlex = splitNode.children.reduce((sum, child) => sum + (child.flex || 1), 0)
    const currentFlexRatio = (targetWindow.flex || 1) / totalFlex

    resizingDivider.value = {
        divider,
        startPos: divider.layout === 'horizontal'
            ? e.clientX - rect.left
            : e.clientY - rect.top,
        startFlexRatio: currentFlexRatio,
        containerSize
    }

    document.addEventListener('mousemove', handleDividerMouseMove)
    document.addEventListener('mouseup', handleDividerMouseUp)
}

// 处理拖动移动
function handleDividerMouseMove(e) {
    if (!resizingDivider.value || !containerRef.value) return

    const rect = containerRef.value.getBoundingClientRect()
    const { divider, startPos, startFlexRatio, containerSize } = resizingDivider.value

    const currentPos = divider.layout === 'horizontal'
        ? e.clientX - rect.left
        : e.clientY - rect.top

    const delta = currentPos - startPos
    const flexDelta = delta / containerSize
    const newFlex = startFlexRatio + flexDelta

    tilingLayout.resizeWindowByDrag(divider.targetWindowId, newFlex)
}

// 处理拖动结束
function handleDividerMouseUp() {
    resizingDivider.value = null
    document.removeEventListener('mousemove', handleDividerMouseMove)
    document.removeEventListener('mouseup', handleDividerMouseUp)
}

// 组件卸载时清理
onUnmounted(() => {
    document.removeEventListener('mousemove', handleDividerMouseMove)
    document.removeEventListener('mouseup', handleDividerMouseUp)
})

// 获取已打开的 Markdown 文件列表
const openMdFiles = computed(() => {
    return windowLayouts.value
        .filter(l => l.window.type === 'markdown')
        .map(l => l.window.filename)
})

// 获取已打开的 Terminal 文件列表
const openTerminalFiles = computed(() => {
    return windowLayouts.value
        .filter(l => l.window.type === 'terminal')
        .map(l => l.window.filename)
})

// 暴露给父组件的方法和属性
defineExpose({
    handleFileSelect,
    openMdFiles,
    openTerminalFiles
})
</script>

<template>
    <div class="tiling-layout-container" ref="containerRef">
        <!-- Windows -->
        <div
            v-for="layout in windowLayouts"
            :key="layout.id"
            class="window"
            :class="{ focused: layout.id === tilingLayout.focusedWindowId.value }"
            :style="getWindowStyle(layout)"
            @click="onWindowFocus(layout.id)"
        >
            <!-- Window header -->
            <div class="window-header">
                <span class="window-title">
                    {{ layout.window.filename }}
                </span>
                <div class="window-actions">
                    <button class="window-action-btn" @click.stop="splitWindow('horizontal', layout.id)" title="Split horizontally">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="12" y1="3" x2="12" y2="21"/>
                        </svg>
                    </button>
                    <button class="window-action-btn" @click.stop="splitWindow('vertical', layout.id)" title="Split vertically">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                        </svg>
                    </button>
                    <button class="window-close" @click.stop="closeWindow(layout.id)">
                        ×
                    </button>
                </div>
            </div>

            <!-- Window content -->
            <div class="window-content">
                <MarkdownViewer
                    v-if="layout.window.type === 'markdown'"
                    :content="mdContent.getContent(layout.id)"
                    :loading="mdContent.isLoading(layout.id)"
                    :on-execute-command="executeCommandInAllTerminals"
                />

                <Terminal
                    v-else-if="layout.window.type === 'terminal'"
                    :ref="el => setTerminalRef(layout.id, el)"
                    :ws-url="getWsUrl(layout.window.filename, layout.id)"
                />
            </div>
        </div>

        <!-- Resize dividers -->
        <div
            v-for="divider in dividers"
            :key="divider.id"
            class="resize-divider"
            :class="divider.layout === 'horizontal' ? 'horizontal' : 'vertical'"
            :style="{
                left: divider.position.x + 'px',
                top: divider.position.y + 'px',
                width: divider.position.width + 'px',
                height: divider.position.height + 'px'
            }"
            @mousedown="handleDividerMouseDown($event, divider)"
        ></div>

        <!-- Empty state -->
        <div v-if="windowLayouts.length === 0" class="empty-state">
            <div class="empty-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 2v16a2 2 0 0 2 6a2 2 0 0 2 6a2 2 0 0 2-2 2h16a2 2 0 0 2 6a2 2 0 0 2-2V8z"></path>
                    <polyline points="14 2 16 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <h2>Select a file to get started</h2>
                <p>Click a file in the sidebar to open it</p>
                <p class="hint">Use the buttons in the window header to split or close windows</p>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tiling-layout-container {
    position: relative;
    width: 100%;
    height: 100%;
    background-color: #1e1e1e;
}

.window {
    position: absolute;
    display: flex;
    flex-direction: column;
    background-color: #252525;
    border: 2px solid transparent;
    box-sizing: border-box;
    overflow: hidden;
}

.window.focused {
    border-color: rgba(0, 122, 204, 0.3);
}

.window-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 28px;
    padding: 0 8px;
    background-color: #2d2d2d;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
}

.window-title {
    font-size: 12px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.window-actions {
    display: flex;
    align-items: center;
    gap: 4px;
}

.window-action-btn {
    background: none;
    border: none;
    color: #888;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: all 0.2s;
}

.window-action-btn:hover {
    background-color: #444;
    color: #f0f0f0;
}

.window-close {
    background: none;
    border: none;
    color: #888;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
}

.window-close:hover {
    color: #f0f0f0;
}

.window-content {
    flex: 1;
    overflow-y: auto;
    position: relative;
}

/* Resize divider */
.resize-divider {
    position: absolute;
    z-index: 100;
    transition: background-color 0.2s;
}

.resize-divider.horizontal {
    cursor: col-resize;
    background-color: rgba(255, 255, 255, 0.15);
}

.resize-divider.horizontal:hover,
.resize-divider.horizontal:active {
    background-color: #007acc;
}

.resize-divider.vertical {
    cursor: row-resize;
    background-color: rgba(255, 255, 255, 0.15);
}

.resize-divider.vertical:hover,
.resize-divider.vertical:active {
    background-color: #007acc;
}

.empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    background-color: #1e1e1e;
}

.empty-content {
    text-align: center;
    color: #666;
}

.empty-content svg {
    color: #444;
    margin-bottom: 16px;
}

.empty-content h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 500;
    color: #888;
}

.empty-content p {
    margin: 8px 0;
    font-size: 14px;
    color: #666;
}

.empty-content .hint {
    margin-top: 16px;
    font-size: 12px;
    color: #555;
}
</style>
