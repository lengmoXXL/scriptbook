import { ref, readonly } from 'vue'

/**
 * 全局错误处理器单例
 * 通过 provide/inject 在所有组件中共享
 */
const globalErrorHandler = {
    errorMessage: ref(''),
    isVisible: ref(false),
    autoHideTimeout: null,

    /**
     * 显示错误信息
     * @param {string} message - 错误信息
     * @param {number} duration - 自动消失时间（毫秒），0 表示不自动消失
     */
    showError(message, duration = 5000) {
        globalErrorHandler.errorMessage.value = message
        globalErrorHandler.isVisible.value = true

        // 清除之前的定时器
        if (globalErrorHandler.autoHideTimeout) {
            clearTimeout(globalErrorHandler.autoHideTimeout)
        }

        // 设置新的自动消失定时器
        if (duration > 0) {
            globalErrorHandler.autoHideTimeout = setTimeout(() => {
                globalErrorHandler.hideError()
            }, duration)
        }
    },

    /**
     * 隐藏错误信息
     */
    hideError() {
        globalErrorHandler.isVisible.value = false
        globalErrorHandler.errorMessage.value = ''
    }
}

/**
 * 获取全局错误处理器
 * 在组件中通过 inject('errorHandler') 使用
 */
export function useErrorHandler() {
    return {
        errorMessage: readonly(globalErrorHandler.errorMessage),
        isVisible: readonly(globalErrorHandler.isVisible),
        showError: globalErrorHandler.showError.bind(globalErrorHandler),
        hideError: globalErrorHandler.hideError.bind(globalErrorHandler)
    }
}
