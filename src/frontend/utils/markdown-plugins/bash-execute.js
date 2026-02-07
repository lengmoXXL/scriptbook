/**
 * markdown-it plugin for adding execute buttons to shell code blocks.
 *
 * This plugin wraps shell code blocks (bash, sh, shell, zsh) with a container
 * that includes an execute button. The button has data attributes for the
 * command content to enable execution in the terminal.
 */

export default function bashExecutePlugin(md, options = {}) {
  const defaultLanguages = ['bash', 'sh', 'shell', 'zsh']
  const languages = options.languages || defaultLanguages

  // Save the original fence renderer
  const defaultRender = md.renderer.rules.fence || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options)
  }

  // Override fence rendering rule
  md.renderer.rules.fence = function(tokens, idx, options, env, self) {
    const token = tokens[idx]
    const lang = token.info.trim()

    // If not a target language, use default rendering
    if (!languages.includes(lang)) {
      return defaultRender(tokens, idx, options, env, self)
    }

    const code = token.content

    // Skip empty or whitespace-only code blocks
    if (!code || !code.trim()) {
      return defaultRender(tokens, idx, options, env, self)
    }

    // Escape HTML in the command to prevent XSS
    const escapedCode = md.utils.escapeHtml(code)

    // Generate HTML structure with button
    return `
<div class="bash-code-container">
  <button class="execute-bash-btn" data-command="${escapedCode}">
    ▶ Execute
  </button>
  ${defaultRender(tokens, idx, options, env, self)}
</div>
    `.trim()
  }
}
