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
    error: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['executeCommand'])

const markdownContentRef = ref(null)

const renderedHtml = computed(() => {
    if (props.error) {
        return `<div class="error-message">${props.error}</div>`
    }
    if (props.loading) {
        return '<div class="loading-message">Loading content...</div>'
    }
    return renderMarkdown(props.content)
})

function handleExecuteButtonClick(e) {
    if (e.target.classList.contains('execute-bash-btn')) {
        e.preventDefault()
        const command = e.target.dataset.command
        if (command) {
            emit('executeCommand', command)
        }
    }
}

// Set up event delegation for execute buttons
onMounted(() => {
    // Wait for initial render to attach event listener
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
    padding: 20px;
    background-color: #1e1e1e;
    color: #f0f0f0;
}

/* Styles for the rendered markdown content */
.markdown-content :deep() {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    line-height: 1.6;
}

.markdown-content :deep() h1,
.markdown-content :deep() h2,
.markdown-content :deep() h3,
.markdown-content :deep() h4,
.markdown-content :deep() h5,
.markdown-content :deep() h6 {
    margin-top: 1.5em;
    margin-bottom: 0.5em;
    font-weight: 600;
    color: #ffffff;
}

.markdown-content :deep() h1 {
    font-size: 2em;
    border-bottom: 1px solid #444;
    padding-bottom: 0.3em;
}

.markdown-content :deep() h2 {
    font-size: 1.5em;
    border-bottom: 1px solid #444;
    padding-bottom: 0.3em;
}

.markdown-content :deep() h3 {
    font-size: 1.25em;
}

.markdown-content :deep() p {
    margin: 1em 0;
}

.markdown-content :deep() a {
    color: #58a6ff;
    text-decoration: none;
}

.markdown-content :deep() a:hover {
    text-decoration: underline;
}

.markdown-content :deep() code {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
    background-color: #2a2a2a;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.9em;
}

.markdown-content :deep() pre {
    background-color: #2a2a2a;
    padding: 16px;
    border-radius: 6px;
    overflow-x: auto;
    margin: 1em 0;
}

.markdown-content :deep() pre code {
    background-color: transparent;
    padding: 0;
}

.markdown-content :deep() blockquote {
    border-left: 4px solid #555;
    padding-left: 16px;
    margin-left: 0;
    color: #aaa;
}

.markdown-content :deep() ul,
.markdown-content :deep() ol {
    margin: 1em 0;
    padding-left: 2em;
}

.markdown-content :deep() li {
    margin: 0.5em 0;
}

.markdown-content :deep() table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
}

.markdown-content :deep() th,
.markdown-content :deep() td {
    border: 1px solid #444;
    padding: 8px 12px;
    text-align: left;
}

.markdown-content :deep() th {
    background-color: #2a2a2a;
    font-weight: 600;
}

.markdown-content :deep() tr:nth-child(even) {
    background-color: #252525;
}

.markdown-content :deep() .error-message {
    color: #ff6b6b;
    padding: 20px;
    text-align: center;
    font-style: italic;
}

.markdown-content :deep() .loading-message {
    color: #999;
    padding: 20px;
    text-align: center;
    font-style: italic;
}

/* Bash execute button styles */
.markdown-content :deep() .bash-code-container {
    position: relative;
    margin: 1em 0;
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

.markdown-content :deep() pre {
    position: relative;
}
</style>