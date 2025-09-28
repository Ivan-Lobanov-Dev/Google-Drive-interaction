import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AuthService } from '../authService'
import type { User } from '../../types/auth'

// Mock fetch globally
const mockFetch = vi.fn()
global.fetch = mockFetch

// Mock window.location
const mockLocation = {
  href: '',
  pathname: '/',
  search: '',
  title: 'Test'
}
Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true
})

// Mock window.history
const mockHistory = {
  replaceState: vi.fn()
}
Object.defineProperty(window, 'history', {
  value: mockHistory,
  writable: true
})

describe('AuthService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.href = ''
    mockLocation.search = ''
    mockLocation.pathname = '/'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getUserData', () => {
    it('should return user data when request is successful', async () => {
      const mockUser: User = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: 'https://example.com/avatar.jpg'
      }

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: mockUser })
      })

      const result = await AuthService.getUserData()

      expect(result).toEqual(mockUser)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/me'),
        expect.objectContaining({
          credentials: 'include'
        })
      )
    })

    it('should return null when request fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      })

      const result = await AuthService.getUserData()

      expect(result).toBeNull()
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('should return null when request throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await AuthService.getUserData()

      expect(result).toBeNull()
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('should handle malformed response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ invalid: 'data' })
      })

      const result = await AuthService.getUserData()

      expect(result).toBeUndefined()
    })
  })

  describe('checkAuthStatus', () => {
    it('should return true when user is authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: {} })
      })

      const result = await AuthService.checkAuthStatus()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('should return false when user is not authenticated', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401
      })

      const result = await AuthService.checkAuthStatus()

      expect(result).toBe(false)
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('should return false when request throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await AuthService.checkAuthStatus()

      expect(result).toBe(false)
    })
  })

  describe('initiateLogin', () => {
    it('should return auth URL when request is successful', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?client_id=123'
      
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ authUrl: mockAuthUrl })
      })

      const result = await AuthService.initiateLogin()

      expect(result).toBe(mockAuthUrl)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/google')
      )
    })

    it('should throw error when no auth URL in response', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({})
      })

      await expect(AuthService.initiateLogin()).rejects.toThrow('Failed to get auth URL')
    })

    it('should throw error when request fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(AuthService.initiateLogin()).rejects.toThrow('Network error')
    })
  })

  describe('login', () => {
    it('should redirect to auth URL when login is successful', async () => {
      const mockAuthUrl = 'https://accounts.google.com/oauth/authorize?client_id=123'
      
      mockFetch.mockResolvedValueOnce({
        json: async () => ({ authUrl: mockAuthUrl })
      })

      await AuthService.login()

      expect(mockLocation.href).toBe(mockAuthUrl)
      expect(mockFetch).toHaveBeenCalledOnce()
    })

    it('should throw error when no auth URL is returned', async () => {
      mockFetch.mockResolvedValueOnce({
        json: async () => ({})
      })

      await expect(AuthService.login()).rejects.toThrow('Failed to get auth URL')
    })

    it('should throw error when request fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      await expect(AuthService.login()).rejects.toThrow('Network error')
    })
  })

  describe('logout', () => {
    it('should return true when logout is successful', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true
      })

      const result = await AuthService.logout()

      expect(result).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/logout'),
        expect.objectContaining({
          method: 'POST',
          credentials: 'include'
        })
      )
    })

    it('should return false when logout fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      })

      const result = await AuthService.logout()

      expect(result).toBe(false)
    })

    it('should return false when request throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await AuthService.logout()

      expect(result).toBe(false)
    })
  })

  describe('isOAuthCallback', () => {
    it('should return true when URL contains auth=success', () => {
      mockLocation.search = '?auth=success&state=123'

      const result = AuthService.isOAuthCallback()

      expect(result).toBe(true)
    })

    it('should return false when URL does not contain auth=success', () => {
      mockLocation.search = '?other=param'

      const result = AuthService.isOAuthCallback()

      expect(result).toBe(false)
    })

    it('should return false when URL has no search params', () => {
      mockLocation.search = ''

      const result = AuthService.isOAuthCallback()

      expect(result).toBe(false)
    })
  })

  describe('cleanupOAuthUrl', () => {
    it('should remove query parameters from URL', () => {
      mockLocation.search = '?auth=success&state=123'
      mockLocation.pathname = '/dashboard'

      AuthService.cleanupOAuthUrl()

      expect(mockHistory.replaceState).toHaveBeenCalledWith(
        {},
        '',
        '/dashboard'
      )
    })

    it('should work with empty search params', () => {
      mockLocation.search = ''
      mockLocation.pathname = '/dashboard'

      AuthService.cleanupOAuthUrl()

      expect(mockHistory.replaceState).toHaveBeenCalledWith(
        {},
        '',
        '/dashboard'
      )
    })
  })
})
