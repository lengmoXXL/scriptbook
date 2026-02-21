import { ref, onUnmounted } from 'vue'

/**
 * Composable for handling element resize with mouse drag.
 *
 * @param {Object} options - Configuration options
 * @param {string} options.direction - Resize direction: 'horizontal' or 'vertical'
 * @param {number} options.min - Minimum size (pixels or flex ratio)
 * @param {number} options.max - Maximum size (pixels or flex ratio)
 * @param {Function} options.getSize - Function to get current size
 * @param {Function} options.setSize - Function to set new size
 * @returns {Object} - { startResize, cleanup }
 */
export function useResizable(options = {}) {
    const {
        direction = 'horizontal',
        min = 0,
        max = Infinity,
        getSize,
        setSize
    } = options

    let resizeHandler = null

    function startResize(event) {
        const startX = event.clientX
        const startY = event.clientY
        const startSize = getSize()

        function onMouseMove(e) {
            const delta = direction === 'horizontal'
                ? e.clientX - startX
                : e.clientY - startY

            let newSize = startSize + delta
            newSize = Math.max(min, Math.min(max, newSize))
            setSize(newSize)
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            resizeHandler = null
        }

        resizeHandler = { onMouseMove, onMouseUp }
        document.addEventListener('mousemove', onMouseMove)
        document.addEventListener('mouseup', onMouseUp)
        document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize'
        document.body.style.userSelect = 'none'
    }

    function cleanup() {
        if (resizeHandler) {
            document.removeEventListener('mousemove', resizeHandler.onMouseMove)
            document.removeEventListener('mouseup', resizeHandler.onMouseUp)
        }
    }

    return {
        startResize,
        cleanup
    }
}

/**
 * Composable for horizontal sidebar resize.
 *
 * @param {Object} options
 * @param {number} options.initialWidth - Initial width in pixels
 * @param {number} options.minWidth - Minimum width
 * @param {number} options.maxWidth - Maximum width
 * @returns {Object} - { width, startResize, cleanup }
 */
export function useSidebarResize(options = {}) {
    const {
        initialWidth = 250,
        minWidth = 150,
        maxWidth = 500
    } = options

    const width = ref(initialWidth)

    const { startResize, cleanup } = useResizable({
        direction: 'horizontal',
        min: minWidth,
        max: maxWidth,
        getSize: () => width.value,
        setSize: (newSize) => {
            width.value = newSize
        }
    })

    return {
        width,
        startResize,
        cleanup
    }
}

/**
 * Composable for vertical panel resize using flex ratio.
 *
 * @param {Object} options
 * @param {Function} options.getContentElement - Function to get the container element
 * @param {number} options.initialFlex - Initial flex ratio (0-1)
 * @param {number} options.minFlex - Minimum flex ratio
 * @param {number} options.maxFlex - Maximum flex ratio
 * @returns {Object} - { flex, startResize, cleanup }
 */
export function usePanelResize(options = {}) {
    const {
        getContentElement,
        initialFlex = 0.5,
        minFlex = 0.1,
        maxFlex = 0.9
    } = options

    const flex = ref(initialFlex)
    let resizeHandler = null

    function startResize() {
        const content = getContentElement ? getContentElement() : null
        if (!content) {
            throw new Error('Panel resize failed: content element not found')
        }
        const rect = content.getBoundingClientRect()

        function onMouseMove(e) {
            const relativeY = e.clientY - rect.top
            const newFlex = Math.max(minFlex, Math.min(maxFlex, relativeY / rect.height))
            flex.value = newFlex
        }

        function onMouseUp() {
            document.removeEventListener('mousemove', onMouseMove)
            document.removeEventListener('mouseup', onMouseUp)
            document.body.style.cursor = ''
            document.body.style.userSelect = ''
            resizeHandler = null
        }

        resizeHandler = { onMouseMove, onMouseUp }
        document.addEventListener('mousemove', onMouseMove, { passive: false })
        document.addEventListener('mouseup', onMouseUp)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
    }

    function cleanup() {
        if (resizeHandler) {
            document.removeEventListener('mousemove', resizeHandler.onMouseMove)
            document.removeEventListener('mouseup', resizeHandler.onMouseUp)
        }
    }

    return {
        flex,
        startResize,
        cleanup
    }
}
