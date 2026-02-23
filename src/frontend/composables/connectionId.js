/**
 * Connection ID management for control WebSocket.
 * ID is stored in localStorage and persists across sessions.
 */

const CONNECTION_ID_KEY = 'scriptbook_connection_id'

export function getConnectionId() {
    let id = localStorage.getItem(CONNECTION_ID_KEY)
    if (!id) {
        id = crypto.randomUUID().slice(0, 8)
        localStorage.setItem(CONNECTION_ID_KEY, id)
    }
    return id
}
