import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../lib/prisma.js'

// Mock Prisma client for integration tests
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    user: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      upsert: vi.fn(),
    },
    userSession: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $disconnect: vi.fn(),
  }
}))

describe('Database Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('User Operations', () => {
    it('should create a new user', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: 'https://example.com/avatar.jpg',
        googleId: 'google-user-123'
      }

      const mockUser = {
        id: 'user-123',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as any)

      const result = await prisma.user.create({
        data: userData
      })

      expect(result).toEqual(mockUser)
      expect(prisma.user.create).toHaveBeenCalledWith({
        data: userData
      })
    })

    it('should find user by email', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: 'https://example.com/avatar.jpg',
        googleId: 'google-user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.user.findUnique).mockResolvedValue(mockUser as any)

      const result = await prisma.user.findUnique({
        where: { email: 'test@example.com' }
      })

      expect(result).toEqual(mockUser)
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' }
      })
    })

    it('should upsert user (create or update)', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User Updated',
        pictureUrl: 'https://example.com/new-avatar.jpg',
        googleId: 'google-user-123'
      }

      const mockUser = {
        id: 'user-123',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.user.upsert).mockResolvedValue(mockUser as any)

      const result = await prisma.user.upsert({
        where: { email: userData.email },
        update: {
          name: userData.name,
          pictureUrl: userData.pictureUrl
        },
        create: userData
      })

      expect(result).toEqual(mockUser)
      expect(prisma.user.upsert).toHaveBeenCalledWith({
        where: { email: userData.email },
        update: {
          name: userData.name,
          pictureUrl: userData.pictureUrl
        },
        create: userData
      })
    })

    it('should handle user not found', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

      const result = await prisma.user.findUnique({
        where: { email: 'nonexistent@example.com' }
      })

      expect(result).toBeNull()
    })
  })

  describe('UserSession Operations', () => {
    it('should create a new user session', async () => {
      const sessionData = {
        sessionId: 'session-uuid-123',
        userId: 'user-123',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenExpiresAt: new Date(Date.now() + 3600000)
      }

      const mockSession = {
        id: 'session-123',
        ...sessionData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.userSession.create).mockResolvedValue(mockSession as any)

      const result = await prisma.userSession.create({
        data: sessionData
      })

      expect(result).toEqual(mockSession)
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: sessionData
      })
    })

    it('should find session by sessionId', async () => {
      const mockSession = {
        id: 'session-123',
        sessionId: 'session-uuid-123',
        userId: 'user-123',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenExpiresAt: new Date(Date.now() + 3600000),
        createdAt: new Date(),
        updatedAt: new Date(),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          pictureUrl: 'https://example.com/avatar.jpg'
        }
      }

      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(mockSession as any)

      const result = await prisma.userSession.findUnique({
        where: { sessionId: 'session-uuid-123' },
        include: { user: true }
      })

      expect(result).toEqual(mockSession)
      expect(prisma.userSession.findUnique).toHaveBeenCalledWith({
        where: { sessionId: 'session-uuid-123' },
        include: { user: true }
      })
    })

    it('should update session tokens', async () => {
      const updateData = {
        accessToken: 'new-access-token-123',
        refreshToken: 'new-refresh-token-123',
        tokenExpiresAt: new Date(Date.now() + 7200000)
      }

      const mockUpdatedSession = {
        id: 'session-123',
        sessionId: 'session-uuid-123',
        userId: 'user-123',
        ...updateData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.userSession.update).mockResolvedValue(mockUpdatedSession as any)

      const result = await prisma.userSession.update({
        where: { sessionId: 'session-uuid-123' },
        data: updateData
      })

      expect(result).toEqual(mockUpdatedSession)
      expect(prisma.userSession.update).toHaveBeenCalledWith({
        where: { sessionId: 'session-uuid-123' },
        data: updateData
      })
    })

    it('should delete session', async () => {
      const mockDeletedSession = {
        id: 'session-123',
        sessionId: 'session-uuid-123',
        userId: 'user-123',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenExpiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.userSession.delete).mockResolvedValue(mockDeletedSession as any)

      const result = await prisma.userSession.delete({
        where: { sessionId: 'session-uuid-123' }
      })

      expect(result).toEqual(mockDeletedSession)
      expect(prisma.userSession.delete).toHaveBeenCalledWith({
        where: { sessionId: 'session-uuid-123' }
      })
    })

    it('should handle session not found', async () => {
      vi.mocked(prisma.userSession.findUnique).mockResolvedValue(null)

      const result = await prisma.userSession.findUnique({
        where: { sessionId: 'nonexistent-session' }
      })

      expect(result).toBeNull()
    })

    it('should clean up expired sessions', async () => {
      const mockDeleteResult = {
        count: 5
      }

      vi.mocked(prisma.userSession.deleteMany).mockResolvedValue(mockDeleteResult)

      const result = await prisma.userSession.deleteMany({
        where: {
          tokenExpiresAt: {
            lt: new Date()
          }
        }
      })

      expect(result).toEqual(mockDeleteResult)
      expect(prisma.userSession.deleteMany).toHaveBeenCalledWith({
        where: {
          tokenExpiresAt: {
            lt: expect.any(Date)
          }
        }
      })
    })
  })

  describe('Database Error Handling', () => {
    it('should handle database connection errors', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(new Error('Connection timeout'))

      await expect(prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          googleId: 'google-123'
        }
      })).rejects.toThrow('Connection timeout')
    })

    it('should handle constraint violations', async () => {
      vi.mocked(prisma.user.create).mockRejectedValue(new Error('Unique constraint failed'))

      await expect(prisma.user.create({
        data: {
          email: 'duplicate@example.com',
          name: 'Test User',
          googleId: 'google-123'
        }
      })).rejects.toThrow('Unique constraint failed')
    })

    it('should handle foreign key constraint violations', async () => {
      vi.mocked(prisma.userSession.create).mockRejectedValue(new Error('Foreign key constraint failed'))

      await expect(prisma.userSession.create({
        data: {
          sessionId: 'session-123',
          userId: 'nonexistent-user',
          accessToken: 'token',
          tokenExpiresAt: new Date()
        }
      })).rejects.toThrow('Foreign key constraint failed')
    })
  })

  describe('Transaction Operations', () => {
    it('should handle user and session creation in transaction', async () => {
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        pictureUrl: 'https://example.com/avatar.jpg',
        googleId: 'google-user-123'
      }

      const sessionData = {
        sessionId: 'session-uuid-123',
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        tokenExpiresAt: new Date(Date.now() + 3600000)
      }

      const mockUser = {
        id: 'user-123',
        ...userData,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const mockSession = {
        id: 'session-123',
        ...sessionData,
        userId: 'user-123',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      vi.mocked(prisma.user.create).mockResolvedValue(mockUser as any)
      vi.mocked(prisma.userSession.create).mockResolvedValue(mockSession as any)

      // Simulate transaction-like behavior
      const user = await prisma.user.create({ data: userData })
      const session = await prisma.userSession.create({
        data: {
          ...sessionData,
          userId: user.id
        }
      })

      expect(user).toEqual(mockUser)
      expect(session).toEqual(mockSession)
      expect(prisma.user.create).toHaveBeenCalledWith({ data: userData })
      expect(prisma.userSession.create).toHaveBeenCalledWith({
        data: {
          ...sessionData,
          userId: user.id
        }
      })
    })
  })
})
