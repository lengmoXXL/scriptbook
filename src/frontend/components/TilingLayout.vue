<script setup>
import { ref, computed, onMounted, onUnmounted, inject } from 'vue'
import { useTilingLayout } from '../composables/useTilingLayout.js'
import { useMarkdownContent } from '../composables/useMarkdownContent.js'
import { useControlSocket } from '../composables/useControlSocket.js'
import { saveLayout, loadLayout } from '../composables/useLayoutPersistence.js'
import MarkdownViewer from './MarkdownViewer.vue'
import Terminal from './Terminal.vue'
import { CONFIG } from '../config.js'

// 注入全局错误处理器
const errorHandler = inject('errorHandler')

// Terminal refs (keyed by windowId)
const terminalRefs = {}

// 平铺布局管理
const tilingLayout = useTilingLayout()

// 控制通道
const { connectionId } = useControlSocket(handleControlCommand)

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
    return `ws://${host}/ws/${filename}/${windowId}?cid=${connectionId}`
}

// 处理控制命令
function handleControlCommand(action, payload) {
    switch (action) {
        case 'open_window':
            if (payload.type === 'markdown') {
                openMarkdownWindow(payload.filename)
            } else {
                openTerminalWindow(payload.filename)
            }
            break
        case 'split_window': {
            const windowId = payload.windowId || tilingLayout.focusedWindowId.value
            if (windowId) {
                splitWindow(payload.direction, windowId)
            }
            break
        }
        case 'close_window': {
            const closeWindowId = payload.windowId || tilingLayout.focusedWindowId.value
            if (closeWindowId) {
                closeWindow(closeWindowId)
            }
            break
        }
        case 'focus_window':
            if (payload.windowId) {
                tilingLayout.focusWindowById(payload.windowId)
            }
            break
    }
}

// 文件选择处理（供 App 组件调用）
function handleFileSelect(selection) {
    const { filename, isLocal, splitDirection } = selection
    const windowType = isLocal ? 'markdown' : 'terminal'

    if (splitDirection && tilingLayout.focusedWindowId.value) {
        // 分割后打开文件
        openFileWithSplit(filename, windowType, splitDirection)
    } else {
        // 正常打开
        if (isLocal) {
            openMarkdownWindow(filename)
        } else {
            const windowId = openTerminalWindow(filename)
            setTimeout(() => {
                const terminalRef = getTerminalRef(windowId)
                if (terminalRef) {
                    terminalRef.focus()
                }
            }, 50)
        }
    }
}

// 分割窗口并打开指定文件
function openFileWithSplit(filename, windowType, direction) {
    const splitInfo = tilingLayout.splitWindow(direction)
    if (!splitInfo) {
        // 如果没有窗口，直接打开
        if (windowType === 'markdown') {
            openMarkdownWindow(filename)
        } else {
            openTerminalWindow(filename)
        }
        return
    }

    const newWindowId = tilingLayout.createWindowInSplit(splitInfo, {
        type: windowType,
        filename
    })

    if (newWindowId && windowType === 'markdown') {
        mdContent.loadContent(newWindowId, filename)
    }

    if (windowType === 'terminal') {
        setTimeout(() => {
            const terminalRef = getTerminalRef(newWindowId)
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

// 右键菜单状态
const contextMenu = ref({
    visible: false,
    x: 0,
    y: 0,
    windowId: null
})

// 保存布局对话框状态
const saveLayoutDialog = ref({
    visible: false,
    name: ''
})

// 显示右键菜单
function onContextMenu(windowId, e) {
    e.preventDefault()
    contextMenu.value = {
        visible: true,
        x: e.clientX,
        y: e.clientY,
        windowId
    }
}

// 隐藏右键菜单
function hideContextMenu() {
    contextMenu.value.visible = false
}

// 右键菜单操作
function contextMenuSplit(direction) {
    if (contextMenu.value.windowId) {
        splitWindow(direction, contextMenu.value.windowId)
    }
    hideContextMenu()
}

function contextMenuClose() {
    if (contextMenu.value.windowId) {
        closeWindow(contextMenu.value.windowId)
    }
    hideContextMenu()
}

// 保存布局
function contextMenuSaveLayout() {
    hideContextMenu()
    saveLayoutDialog.value = { visible: true, name: '' }
}

async function doSaveLayout() {
    if (!saveLayoutDialog.value.name.trim()) return

    try {
        await saveLayout(
            saveLayoutDialog.value.name.trim(),
            tilingLayout.rootContainer.value,
            tilingLayout.focusedWindowId.value
        )
        saveLayoutDialog.value.visible = false
    } catch (error) {
        errorHandler.handleError(error, 'save layout')
    }
}

// 恢复布局（供父组件调用）
async function restoreLayout(filename) {
    try {
        const layoutData = await loadLayout(filename)
        tilingLayout.rootContainer.value = layoutData.rootContainer
        tilingLayout.focusedWindowId.value = layoutData.focusedWindowId

        // 重新加载所有 markdown 内容
        function loadMarkdownContent(container) {
            if (!container) return
            if (container.type === 'window') {
                if (container.window?.type === 'markdown' && container.window?.filename) {
                    mdContent.loadContent(container.id, container.window.filename)
                }
            } else if (container.type === 'split' && container.children) {
                for (const child of container.children) {
                    loadMarkdownContent(child)
                }
            }
        }
        loadMarkdownContent(layoutData.rootContainer)
    } catch (error) {
        errorHandler.handleError(error, 'restore layout')
    }
}

// 点击其他地方关闭菜单
function handleGlobalClick() {
    if (contextMenu.value.visible) {
        hideContextMenu()
    }
}

// ESC 键关闭菜单
function handleKeydown(e) {
    if (e.key === 'Escape' && contextMenu.value.visible) {
        hideContextMenu()
    }
}

onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
})

// 组件卸载时清理
onUnmounted(() => {
    document.removeEventListener('mousemove', handleDividerMouseMove)
    document.removeEventListener('mouseup', handleDividerMouseUp)
    window.removeEventListener('keydown', handleKeydown)
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
    restoreLayout,
    openMdFiles,
    openTerminalFiles
})
</script>

<template>
    <div class="tiling-layout-container" ref="containerRef" @click="handleGlobalClick">
        <!-- Windows -->
        <div
            v-for="layout in windowLayouts"
            :key="layout.id"
            class="window"
            :class="{
                focused: layout.id === tilingLayout.focusedWindowId.value
            }"
            :style="getWindowStyle(layout)"
            @click="onWindowFocus(layout.id)"
            @contextmenu="onContextMenu(layout.id, $event)"
        >
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

        <!-- Context Menu -->
        <Teleport to="body">
            <div
                v-if="contextMenu.visible"
                class="context-menu"
                :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
                @click.stop
            >
                <div class="context-menu-item" @click="contextMenuSplit('horizontal')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="12" y1="3" x2="12" y2="21"/>
                    </svg>
                    <span>Split Right</span>
                </div>
                <div class="context-menu-item" @click="contextMenuSplit('vertical')">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="18" height="18" rx="2"/>
                        <line x1="3" y1="12" x2="21" y2="12"/>
                    </svg>
                    <span>Split Down</span>
                </div>
                <div class="context-menu-divider"></div>
                <div class="context-menu-item" @click="contextMenuSaveLayout">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17 21 17 13 7 13 7 21"/>
                        <polyline points="7 3 7 8 15 8"/>
                    </svg>
                    <span>Save Layout</span>
                </div>
                <div class="context-menu-item danger" @click="contextMenuClose">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                    <span>Close</span>
                </div>
            </div>
        </Teleport>

        <!-- Save Layout Dialog -->
        <Teleport to="body">
            <div v-if="saveLayoutDialog.visible" class="dialog-overlay" @click.self="saveLayoutDialog.visible = false">
                <div class="dialog">
                    <h3>Save Layout</h3>
                    <input
                        v-model="saveLayoutDialog.name"
                        type="text"
                        placeholder="Layout name"
                        @keyup.enter="doSaveLayout"
                        autofocus
                    />
                    <div class="dialog-buttons">
                        <button class="btn-cancel" @click="saveLayoutDialog.visible = false">Cancel</button>
                        <button class="btn-save" @click="doSaveLayout">Save</button>
                    </div>
                </div>
            </div>
        </Teleport>

        <!-- Empty state -->
        <div v-if="windowLayouts.length === 0" class="empty-state">
            <div class="empty-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 2H6a2 2 0 0 2v16a2 2 0 0 2 6a2 2 0 0 2 6a2 2 0 0 2-2 2h16a2 2 0 0 2 6a2 2 0 0 2-2V8z"></path>
                    <polyline points="14 2 16 8 20 8"></polyline>
                    <line x1="16" y1="13" x2="8" y2="13"></line>
                    <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <h2>Press Ctrl+P to open a file</h2>
                <p class="hint">Right-click on a window to split or close</p>
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

/* Context Menu */
.context-menu {
    position: fixed;
    background-color: #2d2d2d;
    border: 1px solid #454545;
    border-radius: 6px;
    padding: 4px 0;
    min-width: 140px;
    z-index: 10000;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.context-menu-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    cursor: pointer;
    color: #ccc;
    font-size: 13px;
    transition: background-color 0.15s;
}

.context-menu-item:hover {
    background-color: #094771;
    color: #fff;
}

.context-menu-item.danger {
    color: #f48771;
}

.context-menu-item.danger:hover {
    background-color: #5a1d1d;
    color: #f48771;
}

.context-menu-divider {
    height: 1px;
    background-color: #454545;
    margin: 4px 0;
}

/* Dialog */
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10001;
}

.dialog {
    background-color: #2d2d2d;
    border: 1px solid #454545;
    border-radius: 8px;
    padding: 20px;
    min-width: 300px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
}

.dialog h3 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 500;
    color: #fff;
}

.dialog input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #454545;
    border-radius: 4px;
    background-color: #1e1e1e;
    color: #fff;
    font-size: 14px;
    box-sizing: border-box;
}

.dialog input:focus {
    outline: none;
    border-color: #007acc;
}

.dialog-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 16px;
}

.dialog-buttons button {
    padding: 6px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    cursor: pointer;
    transition: background-color 0.15s;
}

.btn-cancel {
    background-color: #454545;
    color: #ccc;
}

.btn-cancel:hover {
    background-color: #555;
}

.btn-save {
    background-color: #007acc;
    color: #fff;
}

.btn-save:hover {
    background-color: #0098ff;
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
