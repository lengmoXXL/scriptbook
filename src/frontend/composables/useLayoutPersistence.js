/**
 * Layout persistence composable for saving and loading window layouts.
 */

import { saveFileContent, getFileContent } from '../api/files.js'

/**
 * Save layout to backend.
 * @param {string} name - Layout name
 * @param {object} rootContainer - Root container node
 * @param {string|null} focusedWindowId - Currently focused window ID
 * @returns {Promise<string>} Saved filename
 */
export async function saveLayout(name, rootContainer, focusedWindowId) {
    const layoutData = {
        name,
        rootContainer,
        focusedWindowId
    }

    const filename = `${name}.layout.json`
    await saveFileContent(filename, JSON.stringify(layoutData, null, 2))
    return filename
}

/**
 * Load layout from backend.
 * @param {string} filename - Layout filename
 * @returns {Promise<object>} Layout data with name, rootContainer, focusedWindowId
 */
export async function loadLayout(filename) {
    const content = await getFileContent(filename)
    return JSON.parse(content)
}
