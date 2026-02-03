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
    let hasError = false
    let errorMessage = ''

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
            hasError = true
            errorMessage = data.error
            return null
        case 'done':
            if (hasError) {
                const error = errorMessage
                reset()
                return { type: 'Error', error: error }
            }
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
        hasError = false
        errorMessage = ''
    }

    function setRequestId(requestId) {
        currentRequestId = requestId
    }

    return {
        handleMessage,
        isDone,
        reset,
        setRequestId,
        showUserMessage: true,
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
        if (data.type !== 'stdout') return null

        try {
            return JSON.parse(data.content)
        } catch {
            return { type: 'ProgressMessage', content: [{ type: 'text', text: data.content }] }
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

    function setRequestId(requestId) {
        currentRequestId = requestId
    }

    return {
        handleMessage,
        isDone,
        reset,
        setRequestId,
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
