import { buildApiUrl, AUTH_ENDPOINTS } from '../config/api'
import type { User, AuthResponse } from '../types/auth'

export class AuthService {
  /**
   * Базовый метод для работы с аутентификацией
   */
  private static async makeAuthRequest(): Promise<Response> {
    return fetch(buildApiUrl(AUTH_ENDPOINTS.ME), {
      credentials: 'include'
    })
  }

  /**
   * Получить данные текущего пользователя
   */
  static async getUserData(): Promise<User | null> {
    try {
      const response = await this.makeAuthRequest()
      
      if (response.ok) {
        const data = await response.json()
        return data.user
      }
      
      return null
    } catch (error) {
      console.error('Failed to get user data:', error)
      return null
    }
  }

  /**
   * Проверить, аутентифицирован ли пользователь (без получения данных)
   */
  static async checkAuthStatus(): Promise<boolean> {
    try {
      const response = await this.makeAuthRequest()
      return response.ok
    } catch (error) {
      console.error('Auth check failed:', error)
      return false
    }
  }

  /**
   * Инициировать процесс входа через Google OAuth
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
      console.error('Login failed:', error)
      throw error
    }
  }

  /**
   * Выполнить перенаправление на страницу входа Google
   */
  static async login(): Promise<void> {
    const authUrl = await this.initiateLogin()
    if (authUrl) {
      window.location.href = authUrl
    }
  }

  /**
   * Выйти из системы
   */
  static async logout(): Promise<boolean> {
    try {
      const response = await fetch(buildApiUrl(AUTH_ENDPOINTS.LOGOUT), {
        method: 'POST',
        credentials: 'include'
      })
      
      return response.ok
    } catch (error) {
      console.error('Logout failed:', error)
      return false
    }
  }

  /**
   * Проверить, является ли текущий URL OAuth callback'ом
   */
  static isOAuthCallback(): boolean {
    const urlParams = new URLSearchParams(window.location.search)
    return urlParams.get('auth') === 'success'
  }

  /**
   * Очистить URL от OAuth параметров
   */
  static cleanupOAuthUrl(): void {
    window.history.replaceState({}, document.title, window.location.pathname)
  }
}
