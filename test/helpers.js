/**
 * Test helpers for sandbox cleanup.
 */

const API_BASE = 'http://localhost:8080/api';

/**
 * Clean up all sandboxes after tests.
 * @param {import('@playwright/test').APIRequestContext} request
 */
export async function cleanupSandboxes(request) {
    try {
        const response = await request.get(`${API_BASE}/sandbox`);
        if (!response.ok()) {
            console.warn('Failed to list sandboxes for cleanup');
            return;
        }

        const sandboxes = await response.json();
        for (const sandbox of sandboxes) {
            try {
                await request.delete(`${API_BASE}/sandbox/${sandbox.id}`);
                console.log(`Cleaned up sandbox: ${sandbox.id}`);
            } catch (err) {
                console.warn(`Failed to cleanup sandbox ${sandbox.id}:`, err.message);
            }
        }
    } catch (err) {
        console.warn('Error during sandbox cleanup:', err.message);
    }
}
