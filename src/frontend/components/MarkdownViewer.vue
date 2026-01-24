<script setup>
import { computed } from 'vue'
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

const renderedHtml = computed(() => {
    if (props.error) {
        return `<div class="error-message">${props.error}</div>`
    }
    if (props.loading) {
        return '<div class="loading-message">Loading content...</div>'
    }
    return renderMarkdown(props.content)
})
</script>

<template>
    <div class="markdown-viewer">
        <div
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
</style>