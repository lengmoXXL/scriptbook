/**
 * Sandbox API client for interacting with backend sandbox service.
 */

// Use localhost:8080 in dev mode, or current host in production
const API_BASE = import.meta.env.DEV
  ? 'http://localhost:8080/api'
  : `http://${window.location.host}/api`

/**
 * List all available sandboxes.
 * @returns {Promise<Array<{id: string}>>} List of sandbox IDs
 */
export async function listSandboxes() {
    const response = await fetch(`${API_BASE}/sandbox`)

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
}

/**
 * Create a new sandbox.
 * @param {Object} [config] - Optional configuration
 * @param {string} [config.image] - Docker image to use
 * @param {string[]} [config.init_commands] - Initialization commands
 * @param {Object} [config.env] - Environment variables
 * @returns {Promise<{id: string, status: string}>} Newly created sandbox information
 */
export async function createSandbox(config = null) {
    const response = await fetch(`${API_BASE}/sandbox`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: config ? JSON.stringify(config) : undefined,
    })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
}

/**
 * Execute a command in the sandbox.
 * @param {string} sandboxId - Sandbox ID
 * @param {string} command - Command to execute
 * @returns {Promise<{output: string, error: string, exitCode: number}>} Command execution result
 */
export async function executeCommand(sandboxId, command) {
    const response = await fetch(`${API_BASE}/sandbox/${sandboxId}/command`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ command }),
    })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
}

/**
 * Get sandbox status and information.
 * @param {string} sandboxId - Sandbox ID
 * @returns {Promise<{id: string, status: string, createdAt: string}>} Sandbox information
 */
export async function getSandboxInfo(sandboxId) {
    const response = await fetch(`${API_BASE}/sandbox/${sandboxId}`)

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    return await response.json()
}

/**
 * Kill/terminate a sandbox.
 * @param {string} sandboxId - Sandbox ID
 * @returns {Promise<void>}
 */
export async function killSandbox(sandboxId) {
    const response = await fetch(`${API_BASE}/sandbox/${sandboxId}`, {
        method: 'DELETE',
    })

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
}