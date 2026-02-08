/**
 * Sandbox output format handlers registry
 * Each handler handles a specific output_format with its own message parsing logic
 */

/**
 * Default handler for standard sandbox output (stdout/stderr/result/done)
 * Returns messages compatible with Dialog component
 */
export function useDefaultHandler() {
    let currentRequestId = null
    let outputLines = []

    function handleMessage(data) {
        switch (data.type) {
        case 'stdout':
        case 'stderr':
            outputLines.push(data.content)
            return null
        case 'result':
            outputLines.push(data.content)
            return null
        case 'error':
            const error = data.error
            reset()
            return { type: 'Error', error: error }
        case 'done':
            const result = outputLines.join('\n')
            reset()
            return { type: 'ResultMessage', result: result || '(no output)' }
        default:
            return null
        }
    }

    function isDone(data) {
        return data.type === 'done'
    }

    function reset() {
        outputLines = []
    }

    function setRequestId(requestId) {
        currentRequestId = requestId
    }

    return {
        handleMessage,
        isDone,
        reset,
        setRequestId,
        inputPlaceholder: "Enter command (e.g., ls, pwd, echo hello)..."
    }
}

/**
 * Handler for claude_stream_json output format
 * Parses JSON lines from stdout and handles Claude daemon messages
 */
export function useClaudeStreamHandler() {
    let currentRequestId = null

    function handleMessage(data) {
        if (data.type === 'error') {
            return { type: 'Error', error: data.error }
        }
        if (data.type !== 'stdout') return null

        try {
            return JSON.parse(data.content)
        } catch {
            return { type: 'ProgressMessage', content: [{ type: 'text', text: data.content }] }
        }
    }

    function isDone(data) {
        if (data.type === 'error') return true
        if (data.type !== 'stdout') return false
        try {
            const msg = JSON.parse(data.content)
            return msg.type === 'finish'
        } catch {
            return false
        }
    }

    function reset() {
        // No-op: messages are managed by SandboxChat component
    }

    function setRequestId(requestId) {
        currentRequestId = requestId
    }

    return {
        handleMessage,
        isDone,
        reset,
        setRequestId,
        inputPlaceholder: 'Ask Claude something...'
    }
}

/**
 * Handler registry - maps type to handler factory
 */
export const handlers = {
    'claude': useClaudeStreamHandler,
    'iflow': useClaudeStreamHandler,
    'default': useDefaultHandler
}

/**
 * Create handler based on config type
 */
export function useSandboxHandler(configData) {
    const sandboxType = configData.value?.type || null
    const handlerFactory = handlers[sandboxType] || handlers['default']
    return handlerFactory()
}
