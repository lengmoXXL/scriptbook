/**
 * Sandbox output format handlers registry
 * Each handler handles a specific output_format with its own message parsing logic
 */

/**
 * Default handler for standard sandbox output (stdout/stderr/result/done)
 */
export function useDefaultHandler() {
    function handleMessage(data) {
        switch (data.type) {
        case 'stdout':
        case 'stderr':
        case 'result':
            return { type: 'sandbox', content: data.content }
        case 'error':
            return { type: 'error', content: data.error }
        case 'done':
            return null
        default:
            return null
        }
    }

    function isDone(data) {
        return data.type === 'done'
    }

    function reset() {
        // No-op: messages are managed by SandboxChat component
    }

    return {
        handleMessage,
        isDone,
        reset,
        showUserMessage: true,
        inputPlaceholder: "Enter command (e.g., ls, pwd, echo hello)..."
    }
}

/**
 * Handler for claude_stream_json output format
 * Parses JSON lines from stdout and handles Claude daemon messages
 */
export function useClaudeStreamHandler() {
    function handleMessage(data) {
        if (data.type !== 'stdout') return null

        try {
            return JSON.parse(data.content)
        } catch {
            return { type: 'sandbox', content: data.content }
        }
    }

    function isDone(data) {
        if (data.type !== 'stdout') return false
        try {
            const msg = JSON.parse(data.content)
            return msg.type === 'ResultMessage' || msg.type === 'Error'
        } catch {
            return false
        }
    }

    function reset() {
        // No-op: messages are managed by SandboxChat component
    }

    return {
        handleMessage,
        isDone,
        reset,
        showUserMessage: false,
        inputPlaceholder: 'Ask Claude something...'
    }
}

/**
 * Handler registry - maps output_format to handler factory
 */
export const handlers = {
    'claude_stream_json': useClaudeStreamHandler,
    'default': useDefaultHandler
}

/**
 * Create handler based on config output_format
 */
export function useSandboxHandler(configData) {
    const outputFormat = configData.value?.output_format || null
    const handlerFactory = handlers[outputFormat] || handlers['default']
    return handlerFactory()
}
