/**
 * Markdown rendering utilities using markdown-it and highlight.js.
 */

import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import attrs from 'markdown-it-attrs'
import taskLists from 'markdown-it-task-lists'
import container from 'markdown-it-container'
import footnote from 'markdown-it-footnote'
import hljs from 'highlight.js'

import 'highlight.js/styles/github-dark.css'

const md = new MarkdownIt({
    html: true,              // Allow HTML in markdown
    linkify: true,           // Auto convert URL-like text to links
    typographer: true,       // Enable smartquotes and other typographic replacements
    breaks: false,           // Disable newline to <br>
    highlight: function(code, lang) {
        try {
            const language = lang && hljs.getLanguage(lang) ? lang : undefined
            const result = language
                ? hljs.highlight(code, { language })
                : hljs.highlightAuto(code)
            return result.value
        } catch {
            return code  // Fallback to original code on any error
        }
    }
})

// Register plugins
md.use(highlightjs)          // Code highlighting with highlight.js
md.use(attrs)                // Support {.className #id key=value} syntax
md.use(taskLists)            // Task lists: - [x] done, - [ ] todo
md.use(container, 'tip')     // ::: tip ... :::
md.use(container, 'warning') // ::: warning ... :::
md.use(container, 'danger')  // ::: danger ... :::
md.use(footnote)             // Footnotes: [^1] and [^1]: footnote text

export function renderMarkdown(markdown) {
    if (!markdown || markdown.trim() === '') {
        return '<p>No content</p>'
    }

    try {
        return md.render(markdown)
    } catch (error) {
        console.error('Error rendering markdown:', error)
        return `<pre class="error">Error rendering markdown: ${error.message}</pre>`
    }
}