/**
 * Markdown rendering utilities using markdown-it and highlight.js.
 */

import MarkdownIt from 'markdown-it'
import highlightjs from 'markdown-it-highlightjs'
import attrs from 'markdown-it-attrs'
import taskLists from 'markdown-it-task-lists'
import container from 'markdown-it-container'
import footnote from 'markdown-it-footnote'
import bashExecutePlugin from './markdown-plugins/bash-execute.js'
import DOMPurify from 'dompurify'

import 'highlight.js/styles/github-dark.css'

const md = new MarkdownIt({
    html: true,              // Allow HTML in markdown
    linkify: true,           // Auto convert URL-like text to links
    typographer: true,       // Enable smartquotes and other typographic replacements
    breaks: false            // Disable newline to <br>
})

// Register plugins
md.use(highlightjs)          // Code highlighting with highlight.js
md.use(attrs)                // Support {.className #id key=value} syntax
md.use(taskLists)            // Task lists: - [x] done, - [ ] todo
md.use(container, 'tip')     // ::: tip ... :::
md.use(container, 'warning') // ::: warning ... :::
md.use(container, 'danger')  // ::: danger ... :::
md.use(footnote)             // Footnotes: [^1] and [^1]: footnote text
md.use(bashExecutePlugin)    // Add execute buttons to shell code blocks

export function renderMarkdown(markdown) {
    if (!markdown || markdown.trim() === '') {
        return ''
    }

    const html = md.render(markdown)
    return DOMPurify.sanitize(html)
}