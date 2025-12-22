/**
 * ANSI 转义序列解析器
 * 将终端 ANSI 序列转换为 HTML，用于在浏览器中显示颜色和格式
 */

(function(window) {
    'use strict';

    /**
     * 检测字符串是否包含 ANSI 转义序列
     * @param {string} text - 要检测的文本
     * @returns {boolean} - 如果包含 ANSI 序列返回 true
     */
    function hasAnsiSequences(text) {
        // 检测常见的 ANSI 转义序列模式
        // 支持以下格式：\x1b[、\033[、[ 格式
        // 实际输出中可能包含字面的 [ 字符作为 ANSI 序列标识
        const ansiPattern = /\x1b\[|\033\[|\[/;
        // 更精确的检测：确保 [ 后面跟数字和分号等 ANSI 序列特征
        const precisePattern = /\x1b\[|\033\[|\[\d+(;\d+)*[mM]/;
        return precisePattern.test(text);
    }

    /**
     * 将 ANSI 转义序列转换为 HTML
     * @param {string} text - 包含 ANSI 序列的文本
     * @returns {string} - 转换后的 HTML 字符串
     */
    function ansiToHtml(text) {
        // 如果 ansiHTML 函数可用，使用它进行转换
        if (typeof window.ansiHTML === 'function') {
            try {
                return window.ansiHTML(text);
            } catch (error) {
                console.warn('ANSI 解析失败:', error);
                return escapeHtml(text);
            }
        }

        // 如果 ansiHTML 不可用，返回转义后的文本
        return escapeHtml(text);
    }

    /**
     * HTML 转义函数
     * @param {string} text - 要转义的文本
     * @returns {string} - 转义后的文本
     */
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 处理文本，根据需要转换 ANSI 序列
     * @param {string} text - 输入文本
     * @returns {string} - 处理后的文本（HTML 或纯文本）
     */
    function processText(text) {
        if (!text || typeof text !== 'string') {
            return text;
        }

        if (hasAnsiSequences(text)) {
            return ansiToHtml(text);
        }

        return text;
    }

    // 导出到全局
    window.OutputOptimizers = window.OutputOptimizers || {};
    window.OutputOptimizers.ansiParser = {
        hasAnsiSequences: hasAnsiSequences,
        ansiToHtml: ansiToHtml,
        processText: processText
    };

})(window);
