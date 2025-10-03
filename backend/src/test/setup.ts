import { vi, beforeEach, afterEach } from 'vitest'
import { PrismaClient } from '@prisma/client'

// Mock environment variables for tests
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'test-jwt-secret'
process.env.GOOGLE_CLIENT_ID = 'test-google-client-id'
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret'
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/google/callback'

// Test database configuration
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5434/gdi_test_db'
process.env.DB_HOST = 'localhost'
process.env.DB_PORT = '5434'
process.env.DB_NAME = 'gdi_test_db'
process.env.DB_USER = 'postgres'
process.env.DB_PASSWORD = 'postgres'

// Initialize Prisma client for test database cleanup
const prisma = new PrismaClient()

// Global test user ID for all tests
global.testUserId = null

// Clean up database before each test to ensure isolation
beforeEach(async () => {
  // Clean up all tables in reverse dependency order
  await prisma.fileChunk.deleteMany()
  await prisma.filesMetadata.deleteMany()
  await prisma.userSession.deleteMany()
  await prisma.user.deleteMany()
  
  // Create a default test user for tests that need it
  const randomSuffix = Math.random().toString(36).substring(2, 15)
  const testUser = await prisma.user.create({
    data: {
      googleUserId: `test-google-user-id-${randomSuffix}`,
      email: `test-${randomSuffix}@example.com`,
      name: 'Test User',
      pictureUrl: 'https://example.com/picture.jpg'
    }
  })
  
  // Store the test user ID globally
  global.testUserId = testUser.id
})

// Close database connection after each test
afterEach(async () => {
  await prisma.$disconnect()
})

// Mock console methods to avoid noise in tests
global.console = {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
}
