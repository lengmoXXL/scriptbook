/**
 * Application configuration.
 * Centralized configuration for the frontend application.
 */

export const CONFIG = {
  // Terminal settings
  terminal: {
    theme: {
      background: '#1e1e1e',
      foreground: '#f0f0f0',
      cursor: '#00ff00'
    },
    fontSize: 14,
    fontFamily: 'Menlo, Monaco, "Courier New", monospace'
  },

  // Layout settings
  layout: {
    sidebar: {
      initialWidth: 250,
      minWidth: 150,
      maxWidth: 500
    },
    panel: {
      initialFlex: 0.5,
      minFlex: 0.1,
      maxFlex: 0.9
    }
  },

  // API settings
  api: {
    devBase: 'http://localhost:8080/api'
  },

  // WebSocket message types
  wsMessageTypes: {
    SETUP: 'setup',
    STDOUT: 'stdout',
    STDERR: 'stderr'
  }
}

/**
 * Get API base URL based on environment.
 * @returns {string} API base URL
 */
export function getApiBaseUrl() {
  if (import.meta.env.DEV) {
    return CONFIG.api.devBase
  }
  return `http://${window.location.host}/api`
}
