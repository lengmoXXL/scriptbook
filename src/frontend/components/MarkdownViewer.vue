<script setup>
import { computed, ref, onMounted, onUnmounted, nextTick } from 'vue'
import { renderMarkdown } from '../utils/markdown.js'

const props = defineProps({
    content: {
        type: String,
        default: ''
    },
    loading: {
        type: Boolean,
        default: false
    },
    onExecuteCommand: {
        type: Function,
        default: null
    }
})

const markdownContentRef = ref(null)

const renderedHtml = computed(() => {
    if (props.loading) {
        return '<div class="loading-message">Loading content...</div>'
    }
    try {
        return renderMarkdown(props.content)
    } catch (error) {
        console.error('Error rendering markdown:', error)
        return `<div class="error-message">Error rendering markdown: ${error.message}</div>`
    }
})

function handleExecuteButtonClick(e) {
    if (e.target.classList.contains('execute-bash-btn')) {
        e.preventDefault()
        let command = e.target.dataset.command
        // HTML 属性会去掉末尾换行，需要补上
        if (command && !command.endsWith('\n')) {
            command += '\n'
        }
        if (command && props.onExecuteCommand) {
            props.onExecuteCommand(command)
        }
    }
}

onMounted(() => {
    nextTick(() => {
        if (markdownContentRef.value) {
            markdownContentRef.value.addEventListener('click', handleExecuteButtonClick)
        }
    })
})

onUnmounted(() => {
    if (markdownContentRef.value) {
        markdownContentRef.value.removeEventListener('click', handleExecuteButtonClick)
    }
})
</script>

<template>
    <div class="markdown-viewer">
        <div
            ref="markdownContentRef"
            class="markdown-content"
            v-html="renderedHtml"
        ></div>
    </div>
</template>

<style scoped>
.markdown-viewer {
    flex: 1;
    overflow-y: auto;
}

.markdown-content :deep() code {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}

.markdown-content :deep() .bash-code-container {
    position: relative;
}

.markdown-content :deep() .execute-bash-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    background-color: #00a67d;
    color: white;
    border: none;
    border-radius: 4px;
    padding: 4px 12px;
    font-size: 0.8em;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s;
}

.markdown-content :deep() .execute-bash-btn:hover {
    background-color: #008f6b;
}

.markdown-content :deep() .execute-bash-btn:active {
    background-color: #007a5a;
}
</style>
