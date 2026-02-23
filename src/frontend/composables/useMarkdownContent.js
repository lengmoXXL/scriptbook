import { ref } from 'vue'
import { getFileContent } from '../api/files.js'

/**
 * 管理 markdown 文件内容的 composable
 */
export function useMarkdownContent(errorHandler) {
    const mdContents = ref({})
    const mdLoading = ref({})

    async function loadContent(windowId, filename) {
        mdLoading.value[windowId] = true
        mdContents.value[windowId] = ''

        try {
            const content = await getFileContent(filename)
            mdContents.value[windowId] = content
        } catch (err) {
            console.error('Error loading file:', err)
            if (errorHandler) {
                errorHandler.showError(`无法加载文件：${filename}`)
            }
        } finally {
            mdLoading.value[windowId] = false
        }
    }

    function getContent(windowId) {
        return mdContents.value[windowId] || ''
    }

    function isLoading(windowId) {
        return mdLoading.value[windowId] || false
    }

    function clearContent(windowId) {
        delete mdContents.value[windowId]
        delete mdLoading.value[windowId]
    }

    return {
        loadContent,
        getContent,
        isLoading,
        clearContent
    }
}
