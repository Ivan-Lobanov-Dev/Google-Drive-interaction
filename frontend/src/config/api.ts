// API Configuration
const getApiBaseUrl = (): string => {
  // Check for environment variable first
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL
  }
  
  // Fallback to localhost for development
  return 'http://localhost:4000'
}

export const API_CONFIG = {
  BASE_URL: getApiBaseUrl(),
  ENDPOINTS: {
    AUTH: {
      ME: '/auth/me',
      GOOGLE: '/auth/google',
      LOGOUT: '/auth/logout'
    }
  }
} as const

// Helper function to build full API URLs
export const buildApiUrl = (endpoint: string): string => {
  return `${API_CONFIG.BASE_URL}${endpoint}`
}

// Export individual endpoints for convenience
export const AUTH_ENDPOINTS = API_CONFIG.ENDPOINTS.AUTH
