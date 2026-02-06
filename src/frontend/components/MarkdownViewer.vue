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
}

.markdown-content :deep() code {
    font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
}
</style>
