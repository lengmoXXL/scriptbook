import { ref, reactive, computed, triggerRef } from 'vue'

/**
 * 生成唯一 ID
 */
function generateId() {
    return `_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * 创建窗口节点
 */
function createWindowNode(windowInfo) {
    return {
        id: generateId(),
        type: 'window',
        window: { ...windowInfo },
        flex: 1
    }
}

/**
 * 创建分割节点
 */
function createSplitNode(layout, children) {
    return {
        id: generateId(),
        type: 'split',
        layout,
        children,
        flex: 1
    }
}

/**
 * 在树中查找指定 ID 的节点及其父节点
 */
function findNodeAndParent(container, windowId, parent = null) {
    if (!container) return null

    if (container.id === windowId) {
        return { node: container, parent }
    }

    if (container.type === 'split' && container.children) {
        for (const child of container.children) {
            const result = findNodeAndParent(child, windowId, container)
            if (result) return result
        }
    }

    return null
}

/**
 * 计算容器树的布局位置
 * 递归计算每个窗口节点的绝对位置和尺寸
 */
export function calculateLayout(container, rect) {
    if (!container) return []

    if (container.type === 'window') {
        return [{
            id: container.id,
            window: container.window,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            flex: container.flex
        }]
    }

    if (container.type === 'split' && container.children) {
        const isHorizontal = container.layout === 'horizontal'
        const results = []
        let offset = 0
        const totalFlex = container.children.reduce((sum, child) => sum + (child.flex || 1), 0)

        for (const child of container.children) {
            const childFlex = child.flex || 1
            const childRatio = childFlex / totalFlex

            const childRect = isHorizontal
                ? {
                    x: rect.x + offset,
                    y: rect.y,
                    width: rect.width * childRatio,
                    height: rect.height
                }
                : {
                    x: rect.x,
                    y: rect.y + offset,
                    width: rect.width,
                    height: rect.height * childRatio
                }

            offset += isHorizontal ? childRect.width : childRect.height
            results.push(...calculateLayout(child, childRect))
        }

        return results
    }

    return []
}

/**
 * 平铺布局管理 composable
 */
export function useTilingLayout() {
    // 根容器 - 初始为空
    const rootContainer = ref(null)

    // 当前聚焦的窗口 ID
    const focusedWindowId = ref(null)

    // 所有打开的窗口
    const windows = ref([])

    /**
     * 打开一个新窗口
     */
    function openWindow(windowInfo) {
        const node = createWindowNode(windowInfo)
        windows.value.push(node)

        if (!rootContainer.value) {
            // 第一个窗口，直接作为根
            rootContainer.value = node
            focusedWindowId.value = node.id
        } else {
            // 找到当前聚焦的窗口，在其旁边打开新窗口
            let targetId = focusedWindowId.value
            if (!targetId) {
                // 如果没有聚焦窗口，找到第一个可用窗口
                const firstWindow = windows.value.find(w => w.type === 'window')
                targetId = firstWindow?.id
            }

            const result = findNodeAndParent(rootContainer.value, targetId)
            if (result && result.parent) {
                // 如果聚焦窗口在某个 split 中，添加到该 split
                const index = result.parent.children.findIndex(c => c.id === targetId)
                result.parent.children.splice(index + 1, 0, node)
            } else if (result && result.node) {
                // 如果聚焦窗口就是根（单个窗口），创建新的 split
                const oldRoot = rootContainer.value
                rootContainer.value = createSplitNode('horizontal', [oldRoot, node])
            } else {
                // 仍然找不到，直接在根节点旁边创建 split
                const oldRoot = rootContainer.value
                rootContainer.value = createSplitNode('horizontal', [oldRoot, node])
            }
            focusedWindowId.value = node.id
        }

        return node.id
    }

    /**
     * 关闭窗口
     */
    function closeWindow(windowId) {
        const result = findNodeAndParent(rootContainer.value, windowId)
        if (!result) return

        const { node, parent } = result

        // 从 windows 数组移除
        const index = windows.value.findIndex(w => w.id === windowId)
        if (index !== -1) {
            windows.value.splice(index, 1)
        }

        if (!parent) {
            // 关闭的是根节点
            rootContainer.value = null
            focusedWindowId.value = null
            return
        }

        // 从父节点的 children 中移除
        const childIndex = parent.children.findIndex(c => c.id === windowId)
        parent.children.splice(childIndex, 1)

        // 如果父节点只剩一个孩子，提升孩子
        if (parent.children.length === 1) {
            const remaining = parent.children[0]
            const grandparent = findNodeAndParent(rootContainer.value, parent.id)?.parent

            if (!grandparent) {
                rootContainer.value = remaining
            } else {
                const idx = grandparent.children.findIndex(c => c.id === parent.id)
                grandparent.children[idx] = remaining
            }
        }

        // 更新焦点到同级的其他窗口
        if (parent.children.length > 0) {
            const newFocusIndex = Math.min(childIndex, parent.children.length - 1)
            focusedWindowId.value = parent.children[newFocusIndex].id
        } else {
            focusedWindowId.value = null
        }
    }

    /**
     * 分割窗口 - 只分割容器，不创建新窗口
     * 返回新容器的 ID，调用者需要自己创建对应的窗口内容
     */
    function splitWindow(direction) {
        if (!focusedWindowId.value || !rootContainer.value) return null

        const result = findNodeAndParent(rootContainer.value, focusedWindowId.value)
        if (!result) return null

        const { node, parent } = result

        // 如果没有父节点，说明当前窗口就是根节点，需要创建一个新的 split 节点
        if (!parent) {
            // 将当前窗口转换为 split 节点，保留原窗口信息
            const windowInfo = { ...node.window }
            rootContainer.value = createSplitNode(direction, [node])
            // 返回分割后的容器 ID，调用者需要在该位置创建新窗口
            return { splitContainerId: rootContainer.value.id, sourceWindow: windowInfo }
        }

        // 如果父节点的布局方向与要分割的方向相同，直接添加新节点
        if (parent.type === 'split' && parent.layout === direction) {
            const index = parent.children.findIndex(c => c.id === focusedWindowId.value)
            // 返回分割后的容器 ID 和位置信息
            return {
                splitContainerId: parent.id,
                insertIndex: index + 1,
                sourceWindow: { ...node.window }
            }
        }

        // 否则创建新的 split 节点
        const splitNode = createSplitNode(direction, [node])

        const childIndex = parent.children.findIndex(c => c.id === node.id)
        parent.children[childIndex] = splitNode

        return {
            splitContainerId: splitNode.id,
            sourceWindow: { ...node.window }
        }
    }

    /**
     * 在指定的分割容器中创建新窗口
     */
    function createWindowInSplit(splitInfo, newWindowInfo) {
        if (!splitInfo || !newWindowInfo) return null

        const { splitContainerId, insertIndex, sourceWindow } = splitInfo

        // 找到分割容器
        const splitResult = findNodeAndParent(rootContainer.value, splitContainerId)
        const splitNode = splitResult?.node

        if (!splitNode || splitNode.type !== 'split') return null

        const newNode = createWindowNode(newWindowInfo)

        // 如果是根节点的分割，添加到 children 数组
        if (!splitResult.parent) {
            if (insertIndex !== undefined) {
                splitNode.children.splice(insertIndex, 0, newNode)
            } else {
                splitNode.children.push(newNode)
            }
        } else {
            // 如果是嵌套的分割，需要找到对应的子节点
            const childIndex = splitNode.children.findIndex(c =>
                c.type === 'window' && c.window.filename === sourceWindow.filename
            )
            if (childIndex !== -1) {
                splitNode.children.splice(childIndex + 1, 0, newNode)
            } else {
                splitNode.children.push(newNode)
            }
        }

        focusedWindowId.value = newNode.id
        return newNode.id
    }

    /**
     * 切换焦点
     */
    function focusWindow(direction) {
        if (!focusedWindowId.value || !rootContainer.value) return

        const layout = calculateLayout(rootContainer.value, { x: 0, y: 0, width: 1, height: 1 })
        const current = layout.find(l => l.id === focusedWindowId.value)
        if (!current) return

        const cx = current.x + current.width / 2
        const cy = current.y + current.height / 2

        let candidates = []

        switch (direction) {
            case 'left':
                candidates = layout.filter(l => {
                    const lx = l.x + l.width / 2
                    return lx < cx && Math.abs((l.y + l.height / 2) - cy) < 0.1
                })
                break
            case 'right':
                candidates = layout.filter(l => {
                    const lx = l.x + l.width / 2
                    return lx > cx && Math.abs((l.y + l.height / 2) - cy) < 0.1
                })
                break
            case 'up':
                candidates = layout.filter(l => {
                    const ly = l.y + l.height / 2
                    return ly < cy && Math.abs((l.x + l.width / 2) - cx) < 0.1
                })
                break
            case 'down':
                candidates = layout.filter(l => {
                    const ly = l.y + l.height / 2
                    return ly > cy && Math.abs((l.x + l.width / 2) - cx) < 0.1
                })
                break
        }

        if (candidates.length > 0) {
            // 找最近的
            candidates.sort((a, b) => {
                const distA = direction === 'left' || direction === 'right'
                    ? Math.abs((a.x + a.width / 2) - cx)
                    : Math.abs((a.y + a.height / 2) - cy)
                const distB = direction === 'left' || direction === 'right'
                    ? Math.abs((b.x + b.width / 2) - cx)
                    : Math.abs((b.y + b.height / 2) - cy)
                return distA - distB
            })
            focusedWindowId.value = candidates[0].id
        }
    }

    /**
     * 调整窗口大小 - 通过 delta 调整当前窗口与下一个兄弟节点的比例
     */
    function resizeWindow(delta) {
        if (!focusedWindowId.value || !rootContainer.value) return

        const result = findNodeAndParent(rootContainer.value, focusedWindowId.value)
        if (!result || !result.parent || result.parent.type !== 'split') return

        const { node, parent } = result
        const index = parent.children.findIndex(c => c.id === focusedWindowId.value)
        const nextSibling = parent.children[index + 1]

        if (!nextSibling) return

        // 调整当前节点和下一个兄弟节点的 flex 值
        const totalFlex = node.flex + nextSibling.flex
        node.flex = Math.max(0.1, node.flex + delta)
        nextSibling.flex = totalFlex - node.flex
    }

    /**
     * 通过拖动调整窗口大小 - 直接设置 flex 值
     * @param {string} windowId - 要调整的窗口 ID
     * @param {number} newFlexRatio - 新的 flex 比例（0-1 之间）
     */
    function resizeWindowByDrag(windowId, newFlexRatio) {
        if (!rootContainer.value) return

        const result = findNodeAndParent(rootContainer.value, windowId)
        if (!result || !result.parent || result.parent.type !== 'split') return

        const { node } = result
        const parent = result.parent

        // 限制最小尺寸
        const minFlexRatio = 0.1
        const maxFlexRatio = 0.9
        newFlexRatio = Math.max(minFlexRatio, Math.min(maxFlexRatio, newFlexRatio))

        // 计算总 flex 值
        const totalFlex = parent.children.reduce((sum, child) => sum + (child.flex || 1), 0)

        // 设置新的 flex 值
        node.flex = newFlexRatio * totalFlex

        // 调整兄弟节点的 flex 值，保持总和不变
        const remainingFlex = totalFlex - node.flex
        const siblings = parent.children.filter(c => c.id !== windowId)

        if (siblings.length > 0) {
            // 平均分配给其他兄弟节点
            const avgFlex = remainingFlex / siblings.length
            for (const sibling of siblings) {
                sibling.flex = avgFlex
            }
        }

        // 触发响应式更新
        triggerRef(rootContainer)
    }

    /**
     * 获取窗口所在的分割容器信息
     * @param {string} windowId - 窗口 ID
     * @param {string} direction - 拖动方向 'horizontal' | 'vertical'
     * @returns {object|null} 分割容器信息
     */
    function getSplitContainerForWindow(windowId, direction) {
        if (!rootContainer.value) return null

        const result = findNodeAndParent(rootContainer.value, windowId)
        if (!result || !result.parent) return null

        const { node, parent } = result

        // 检查父节点的布局方向是否匹配
        if (parent.type === 'split' && parent.layout === direction) {
            const index = parent.children.findIndex(c => c.id === windowId)
            // 检查是否有下一个兄弟节点（用于确定是否可以拖动右边/下边）
            const hasNextSibling = index < parent.children.length - 1
            // 检查是否有前一个兄弟节点（用于确定是否可以拖动左边/上边）
            const hasPrevSibling = index > 0

            return {
                splitNode: parent,
                windowIndex: index,
                hasNextSibling,
                hasPrevSibling,
                layout: parent.layout
            }
        }

        return null
    }

    /**
     * 获取所有窗口的布局信息
     */
    function getLayout() {
        if (!rootContainer.value) {
            return []
        }
        // 使用视口单位计算
        const viewportWidth = window.innerWidth - 250 // 减去 sidebar
        const viewportHeight = window.innerHeight
        return calculateLayout(rootContainer.value, {
            x: 0,
            y: 0,
            width: viewportWidth,
            height: viewportHeight
        })
    }

    /**
     * 获取聚焦的窗口
     */
    const focusedWindow = computed(() => {
        return windows.value.find(w => w.id === focusedWindowId.value)
    })

    /**
     * 聚焦指定的窗口
     */
    function focusWindowById(id) {
        if (windows.value.find(w => w.id === id)) {
            focusedWindowId.value = id
        }
    }

    /**
     * 移动窗口到新位置
     * @param {string} sourceId - 要移动的窗口 ID
     * @param {string} targetId - 目标窗口 ID
     * @param {string} position - 'left' | 'right' | 'top' | 'bottom'
     */
    function moveWindowToPosition(sourceId, targetId, position) {
        if (sourceId === targetId) return

        // 找到源窗口节点
        const sourceResult = findNodeAndParent(rootContainer.value, sourceId)
        if (!sourceResult) return

        const sourceNode = sourceResult.node
        const sourceParent = sourceResult.parent

        // 找到目标窗口节点
        const targetResult = findNodeAndParent(rootContainer.value, targetId)
        if (!targetResult) return

        const targetNode = targetResult.node
        const targetParent = targetResult.parent

        // 确定分割方向
        const splitDirection = (position === 'left' || position === 'right') ? 'horizontal' : 'vertical'
        const insertBefore = (position === 'left' || position === 'top')

        // 从原位置移除源窗口
        if (!sourceParent) return

        const sourceIndex = sourceParent.children.findIndex(c => c.id === sourceId)
        sourceParent.children.splice(sourceIndex, 1)

        // 插入到新位置（先插入再清理，避免 targetParent 引用失效）
        if (!targetParent) {
            // 目标是根节点
            const newSplit = createSplitNode(splitDirection,
                insertBefore ? [sourceNode, targetNode] : [targetNode, sourceNode])
            rootContainer.value = newSplit
        } else if (targetParent.type === 'split' && targetParent.layout === splitDirection) {
            // 目标的父节点是同方向的 split，直接插入
            const targetIndex = targetParent.children.findIndex(c => c.id === targetId)
            const insertIndex = insertBefore ? targetIndex : targetIndex + 1
            targetParent.children.splice(insertIndex, 0, sourceNode)
        } else {
            // 需要创建新的 split 节点
            const newSplit = createSplitNode(splitDirection,
                insertBefore ? [sourceNode, targetNode] : [targetNode, sourceNode])
            const targetIndex = targetParent.children.findIndex(c => c.id === targetId)
            targetParent.children[targetIndex] = newSplit
        }

        // 插入完成后再清理空的 split 节点
        cleanupEmptySplits()
        focusedWindowId.value = sourceId
    }

    /**
     * 清理空的 split 节点
     */
    function cleanupEmptySplits() {
        function cleanup(container, parent = null) {
            if (!container || container.type === 'window') return

            if (container.type === 'split') {
                // 递归清理子节点
                for (let i = container.children.length - 1; i >= 0; i--) {
                    cleanup(container.children[i], container)
                }

                // 如果只剩一个子节点，提升它
                if (container.children.length === 1) {
                    const remaining = container.children[0]
                    if (!parent) {
                        rootContainer.value = remaining
                    } else {
                        const idx = parent.children.findIndex(c => c.id === container.id)
                        parent.children[idx] = remaining
                    }
                }
            }
        }

        cleanup(rootContainer.value)
    }

    return {
        // State
        rootContainer,
        focusedWindowId,
        windows,

        // Computed
        focusedWindow,

        // Actions
        openWindow,
        closeWindow,
        splitWindow,
        createWindowInSplit,
        focusWindow,
        resizeWindow,
        resizeWindowByDrag,
        getSplitContainerForWindow,
        focusWindowById,
        moveWindowToPosition,
        getLayout,
        calculateLayout
    }
}
