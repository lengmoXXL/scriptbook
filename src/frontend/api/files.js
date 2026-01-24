/**
 * File API client for interacting with backend file service.
 */

const API_BASE = 'http://localhost:8080/api'

/**
 * Fetch list of markdown files in the docs directory.
 * @returns {Promise<string[]>} Array of filenames
 */
export async function listFiles() {
    try {
        const response = await fetch(`${API_BASE}/files`)

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return await response.json()
    } catch (error) {
        console.error('Failed to fetch file list:', error)

        // 确保总是抛出标准 Error 对象
        if (!(error instanceof Error)) {
            throw new Error(`Unexpected error: ${String(error)}`)
        }
        throw error
    }
}

/**
 * Fetch content of a specific markdown file.
 * @param {string} filename - Name of the file to read
 * @returns {Promise<string>} File content as plain text
 */
export async function getFileContent(filename) {
    try {
        // Encode filename for URL safety
        const encodedFilename = encodeURIComponent(filename)
        const response = await fetch(`${API_BASE}/files/${encodedFilename}`)

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error(`File not found: ${filename}`)
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        return await response.text()
    } catch (error) {
        console.error(`Failed to fetch file content for ${filename}:`, error)

        // 确保总是抛出标准 Error 对象
        if (!(error instanceof Error)) {
            throw new Error(`Unexpected error: ${String(error)}`)
        }
        throw error
    }
}