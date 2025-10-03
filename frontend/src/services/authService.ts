import { buildApiUrl, AUTH_ENDPOINTS } from '../config/api'
import type { User, AuthResponse } from '../types/auth'

export class AuthService {
  /**
   * Base method for working with authentication
   */
  private static async makeAuthRequest(): Promise<Response> {
    return fetch(buildApiUrl(AUTH_ENDPOINTS.ME), {
      credentials: 'include'
    })
  }

  /**
   * Get current user data
   */
  static async getUserData(): Promise<User | null> {
    try {
      const response = await this.makeAuthRequest()
      
      if (response.ok) {
        const data = await response.json()
        return data.user
      }
      
      return null
    } catch {
      return null
    }
  }

  /**
   * Check if user is authenticated (without getting data)
   */
  static async checkAuthStatus(): Promise<boolean> {
    try {
      const response = await this.makeAuthRequest()
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Initiate login process via Google OAuth
   */
  static async initiateLogin(): Promise<string | null> {
    try {
      const response = await fetch(buildApiUrl(AUTH_ENDPOINTS.GOOGLE))
      const data: AuthResponse = await response.json()
      
      if (data.authUrl) {
        return data.authUrl
      }
      
      throw new Error('Failed to get auth URL')
    } catch (error) {
      throw error
    }
  }

  /**
   * Redirect to Google login page
   */
  static async login(): Promise<void> {
    const authUrl = await this.initiateLogin()
    if (authUrl) {
      window.location.href = authUrl
    }
  }

  /**
   * Logout from system
   */
  static async logout(): Promise<boolean> {
    try {
      const response = await fetch(buildApiUrl(AUTH_ENDPOINTS.LOGOUT), {
        method: 'POST',
        credentials: 'include'
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Check if current URL is OAuth callback
   */
  static isOAuthCallback(): boolean {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('auth') === 'success'
  }

  /**
   * Clean URL from OAuth parameters
   */
  static cleanupOAuthUrl(): void {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}
