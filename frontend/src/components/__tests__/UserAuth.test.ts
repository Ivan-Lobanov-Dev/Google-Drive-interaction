import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
// @ts-expect-error: UserAuth.vue might not have type declarations in test context
import UserAuth from '../UserAuth.vue'
import { AuthService } from '../../services/authService'
import type { User } from '../../types/auth'

vi.mock('../../services/authService', () => ({
  AuthService: {
    getUserData: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    isOAuthCallback: vi.fn(),
    cleanupOAuthUrl: vi.fn()
  }
}))

// Mock window.location and window.history
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

const mockHistory = {
  replaceState: vi.fn()
}
Object.defineProperty(window, 'history', {
  value: mockHistory,
  writable: true
})

describe('UserAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation.href = ''
    mockLocation.search = ''
    mockLocation.pathname = '/'
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('when user is not authenticated', () => {
    it('should render login button', () => {
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      expect(wrapper.find('.login-btn').exists()).toBe(true)
      expect(wrapper.find('.login-btn').text()).toBe('Sign in with Google')
      expect(wrapper.find('.user-section').exists()).toBe(false)
    })

    it('should call AuthService.login when login button is clicked', async () => {
      vi.mocked(AuthService.login).mockResolvedValue(undefined)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      await wrapper.find('.login-btn').trigger('click')

      expect(AuthService.login).toHaveBeenCalledTimes(1)
    })

    it('should show loading state when login is in progress', async () => {
      const mockLogin = vi.mocked(AuthService.login).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      )
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      await wrapper.find('.login-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.login-btn').text()).toBe('Signing in...')
      expect(wrapper.find('.login-btn').attributes('disabled')).toBeDefined()

      await mockLogin()
      await nextTick()

      expect(wrapper.find('.login-btn').text()).toBe('Sign in with Google')
    })
  })

  describe('when user is authenticated', () => {
    const mockUser: User = {
      id: '123',
      email: 'test@example.com',
      name: 'Test User',
      pictureUrl: 'https://example.com/avatar.jpg'
    }

    it('should render user section with loading state initially', () => {
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      expect(wrapper.find('.user-loading').exists()).toBe(true)
      expect(wrapper.find('.spinner').exists()).toBe(true)
      expect(wrapper.find('.user-info').exists()).toBe(false)
    })

    it('should render user info when data is loaded', async () => {
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0)) // Wait for async operations

      expect(AuthService.getUserData).toHaveBeenCalledTimes(1)
      expect(wrapper.find('.user-loading').exists()).toBe(false)
      expect(wrapper.find('.user-info').exists()).toBe(true)
      expect(wrapper.find('.user-avatar').attributes('src')).toBe(mockUser.pictureUrl)
      expect(wrapper.find('.user-details h3').text()).toBe(mockUser.name)
      expect(wrapper.find('.user-details p').text()).toBe(mockUser.email)
    })

    it('should show user avatar placeholder when no picture URL', async () => {
      const userWithoutPicture = { ...mockUser, pictureUrl: null }
      vi.mocked(AuthService.getUserData).mockResolvedValue(userWithoutPicture)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(wrapper.find('.user-avatar').exists()).toBe(false)
      expect(wrapper.find('.user-avatar-placeholder').exists()).toBe(true)
      expect(wrapper.find('.user-avatar-placeholder').text()).toBe('T')
    })

    it('should show avatar placeholder when image fails to load', async () => {
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      // Simulate image error
      await wrapper.find('.user-avatar').trigger('error')

      expect(wrapper.find('.user-avatar').exists()).toBe(false)
      expect(wrapper.find('.user-avatar-placeholder').exists()).toBe(true)
    })

    it('should call logout when logout button is clicked', async () => {
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      vi.mocked(AuthService.logout).mockResolvedValue(true)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      await wrapper.find('.logout-btn').trigger('click')

      expect(AuthService.logout).toHaveBeenCalledTimes(1)
    })

    it('should emit auth-change event when logout is successful', async () => {
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      vi.mocked(AuthService.logout).mockResolvedValue(true)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      await wrapper.find('.logout-btn').trigger('click')

      expect(wrapper.emitted('auth-change')).toBeTruthy()
      expect(wrapper.emitted('auth-change')?.[0]).toEqual([false])
    })

    it('should show loading state during logout', async () => {
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      const mockLogout = vi.mocked(AuthService.logout).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 100))
      )
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      await wrapper.find('.logout-btn').trigger('click')
      await nextTick()

      expect(wrapper.find('.logout-btn').text()).toBe('Signing out...')
      expect(wrapper.find('.logout-btn').attributes('disabled')).toBeDefined()

      await mockLogout()
      await nextTick()

      expect(wrapper.find('.logout-btn').text()).toBe('Sign out')
    })

    it('should emit auth-change event when getUserData fails', async () => {
      const mockGetUserData = vi.mocked(AuthService.getUserData).mockResolvedValue(null)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      await nextTick()

      expect(mockGetUserData).toHaveBeenCalledOnce()
      expect(wrapper.emitted('auth-change')).toBeTruthy()
      expect(wrapper.emitted('auth-change')?.[0]).toEqual([false])
    })
  })

  describe('OAuth callback handling', () => {
    it('should handle OAuth callback on mount', async () => {
      const mockIsOAuthCallback = vi.mocked(AuthService.isOAuthCallback).mockReturnValue(true)
      const mockCleanupOAuthUrl = vi.mocked(AuthService.cleanupOAuthUrl).mockImplementation(() => {})
      const mockGetUserData = vi.mocked(AuthService.getUserData).mockResolvedValue(null)
      
      mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      expect(mockIsOAuthCallback).toHaveBeenCalledOnce()
      expect(mockCleanupOAuthUrl).toHaveBeenCalledOnce()
      expect(mockGetUserData).toHaveBeenCalledOnce()
    })

    it('should not handle OAuth callback when not present', async () => {
      const mockIsOAuthCallback = vi.mocked(AuthService.isOAuthCallback).mockReturnValue(false)
      const mockCleanupOAuthUrl = vi.mocked(AuthService.cleanupOAuthUrl).mockImplementation(() => {})
      
      mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      expect(mockIsOAuthCallback).toHaveBeenCalledOnce()
      expect(mockCleanupOAuthUrl).not.toHaveBeenCalled()
    })
  })

  describe('watchers', () => {
    it('should fetch user data when isAuthenticated becomes true', async () => {
      const mockGetUserData = vi.mocked(AuthService.getUserData).mockResolvedValue(null)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      // Change prop
      await wrapper.setProps({ isAuthenticated: true })

      expect(mockGetUserData).toHaveBeenCalledOnce()
    })

    it('should clear user data when isAuthenticated becomes false', async () => {
      const mockGetUserData = vi.mocked(AuthService.getUserData).mockResolvedValue(null)
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      await nextTick() // Wait for initial getUserData call

      // Change prop
      await wrapper.setProps({ isAuthenticated: false })

      // Should not call getUserData again
      expect(mockGetUserData).toHaveBeenCalledOnce()
    })
  })

  describe('error handling', () => {
    it('should handle login errors gracefully', async () => {
      vi.mocked(AuthService.login).mockRejectedValue(new Error('Login failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: false
        }
      })

      await wrapper.find('.login-btn').trigger('click')
      await nextTick()

      expect(consoleSpy).toHaveBeenCalledWith('Login failed:', expect.any(Error))
      expect(wrapper.find('.login-btn').text()).toBe('Sign in with Google') // Should reset loading state
    })

    it('should handle logout errors gracefully', async () => {
      const mockUser: User = {
        id: '123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: null
      }
      vi.mocked(AuthService.getUserData).mockResolvedValue(mockUser)
      vi.mocked(AuthService.logout).mockRejectedValue(new Error('Logout failed'))
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      const wrapper = mount(UserAuth, {
        props: {
          isAuthenticated: true
        }
      })

      // Wait for getUserData to complete
      await wrapper.vm.$nextTick()
      await new Promise(resolve => setTimeout(resolve, 0))

      await wrapper.find('.logout-btn').trigger('click')
      await nextTick()

      expect(consoleSpy).toHaveBeenCalledWith('Logout failed:', expect.any(Error))
      expect(wrapper.find('.logout-btn').text()).toBe('Sign out') // Should reset loading state
    })
  })
})
