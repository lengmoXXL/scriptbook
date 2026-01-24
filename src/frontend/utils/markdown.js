/**
 * Markdown rendering utilities using marked and highlight.js.
 */

import { marked } from 'marked'
import hljs from 'highlight.js'

import 'highlight.js/styles/github-dark.css'

marked.setOptions({
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
    },
    langPrefix: 'hljs language-',
    pedantic: false,
    gfm: true, // GitHub Flavored Markdown
    breaks: false,
    sanitize: false, // Allow HTML in markdown (use with caution)
    smartLists: true,
    smartypants: false
})

/**
 * Render markdown string to HTML.
 * @param {string} markdown - Markdown text
 * @returns {string} Rendered HTML
 */
export function renderMarkdown(markdown) {
    if (!markdown || markdown.trim() === '') {
        return '<p>No content</p>'
    }

    try {
        return marked.parse(markdown)
    } catch (error) {
        console.error('Error rendering markdown:', error)
        return `<pre class="error">Error rendering markdown: ${error.message}</pre>`
    }
}