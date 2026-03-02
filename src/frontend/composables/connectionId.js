/**
 * Connection ID management for control WebSocket.
 * ID is stored in localStorage and persists across sessions.
 */

const CONNECTION_ID_KEY = 'scriptbook_connection_id'

export function getConnectionId() {
    let id = localStorage.getItem(CONNECTION_ID_KEY)
    if (!id) {
        id = Math.random().toString(36).slice(2, 10)
        localStorage.setItem(CONNECTION_ID_KEY, id)
    }
    return id
}
