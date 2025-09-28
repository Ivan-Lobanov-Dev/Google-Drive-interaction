import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Request, Response, NextFunction } from 'express'
import { google } from 'googleapis'
import { prisma } from '../../lib/prisma.js'
import { authenticate } from '../auth.js'
import type { AuthenticatedRequest } from '../auth.js'

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        getAccessToken: vi.fn(),
      }))
    }
  }
}))

// Mock prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    userSession: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }
}))

// Mock environment variables
process.env.GOOGLE_CLIENT_ID = 'test-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret'
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/callback'

describe('Auth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>
  let mockResponse: Partial<Response>
  let mockNext: NextFunction

  beforeEach(() => {
    vi.clearAllMocks()
    
    mockRequest = {
      headers: {},
      cookies: {},
    }
    
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      cookie: vi.fn().mockReturnThis(),
      clearCookie: vi.fn().mockReturnThis(),
    }
    
    mockNext = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // Note: refreshAccessToken is not exported, so we test it through authenticate middleware

  describe('authenticate', () => {
    it('should authenticate user with valid session', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: 'https://example.com/avatar.jpg'
      }

      const mockSession = {
        id: 'session-123',
        sessionId: 'session-token-123',
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        user: mockUser
      }

      mockRequest.cookies = { sessionId: 'session-token-123' }

      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(mockSession as any)

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockRequest.user).toEqual(mockUser)
      expect(mockRequest.session).toEqual({
        id: mockSession.id,
        sessionId: mockSession.sessionId,
        accessToken: mockSession.accessToken,
        refreshToken: mockSession.refreshToken,
        tokenExpiresAt: mockSession.tokenExpiresAt
      })
      expect(mockNext).toHaveBeenCalled()
    })

    it('should return 401 when no session cookie', async () => {
      mockRequest.cookies = {}

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockResponse.status).toHaveBeenCalledWith(401)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication required' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should return 401 when session not found in database', async () => {
      mockRequest.cookies = { sessionId: 'invalid-session' }
      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(null)

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockResponse.status).toHaveBeenCalledWith(401)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Invalid session' })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle expired token scenario', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: null
      }

      const mockSession = {
        id: 'session-123',
        sessionId: 'session-token-123',
        accessToken: 'expired-access-token',
        refreshToken: null, // No refresh token
        tokenExpiresAt: new Date(Date.now() - 1000), // Expired
        user: mockUser
      }

      mockRequest.cookies = { sessionId: 'session-token-123' }
      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(mockSession as any)

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockResponse.status).toHaveBeenCalledWith(401)
      expect(mockResponse.json).toHaveBeenCalledWith({ 
        error: 'Session expired and no refresh token available' 
      })
      expect(mockNext).not.toHaveBeenCalled()
    })

    it('should handle session with valid non-expired token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: null
      }

      const mockSession = {
        id: 'session-123',
        sessionId: 'session-token-123',
        accessToken: 'valid-access-token',
        refreshToken: 'valid-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600000), // Not expired
        user: mockUser
      }

      mockRequest.cookies = { sessionId: 'session-token-123' }
      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(mockSession as any)

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockRequest.user).toEqual(mockUser)
      expect(mockNext).toHaveBeenCalled()
    })

    it('should handle database errors gracefully', async () => {
      mockRequest.cookies = { sessionId: 'session-token-123' }
      vi.mocked(prisma.userSession.findUnique).mockRejectedValue(new Error('Database connection failed'))

      await authenticate(mockRequest as AuthenticatedRequest, mockResponse as Response, mockNext)

      expect(mockResponse.status).toHaveBeenCalledWith(500)
      expect(mockResponse.json).toHaveBeenCalledWith({ error: 'Authentication failed' })
      expect(mockNext).not.toHaveBeenCalled()
    })
  })
})
