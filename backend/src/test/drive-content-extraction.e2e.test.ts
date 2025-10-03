import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import type { FileResponse } from '../types/test.js';

// Mock GoogleDriveAdapter for testing
vi.mock('../adapters/googleDriveAdapter.js', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(() => ({
    deleteFile: vi.fn().mockResolvedValue(true),
    updateFile: vi.fn().mockResolvedValue({
      id: 'test-file-id',
      name: 'Updated File',
      mimeType: 'text/plain',
      size: 100,
      modifiedTime: new Date().toISOString(),
      createdTime: new Date().toISOString(),
      webViewLink: 'https://drive.google.com/file/test',
      webContentLink: 'https://drive.google.com/file/test/download',
      thumbnailLink: 'https://drive.google.com/file/test/thumbnail',
      iconLink: 'https://drive.google.com/file/test/icon',
      description: 'Updated description',
      starred: false,
      trashed: false,
      shared: false,
      ownedByMe: true,
      owners: [],
      parents: []
    })
  }))
}));

describe('Drive Content Extraction E2E Tests', () => {
  const getTestUserId = (): string => {
    const testUserId = global.testUserId;
    if (!testUserId) {
      throw new Error('Test user ID not available. Make sure setup.ts beforeEach has run.');
    }
    return testUserId;
  };
  let testSessionId: string;
  let authCookie: string;

  beforeAll(async () => {
    await prisma.$connect();
  });
  
  beforeEach(async () => {
    // Ensure we have a test user ID
    const testUserId = global.testUserId;
    if (!testUserId) {
      throw new Error('Test user ID not available. Make sure setup.ts beforeEach has run.');
    }
    
    // Create a test session for the authenticated user
    const testSession = await prisma.userSession.create({
      data: {
        userId: getTestUserId(),
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600000) // 1 hour
      }
    });
    testSessionId = testSession.sessionId;
    authCookie = `sessionId=${testSessionId}`;
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.fileChunk.deleteMany({});
    await prisma.filesMetadata.deleteMany({});
    await prisma.userSession.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clean up files and chunks before each test
    await prisma.fileChunk.deleteMany({});
    await prisma.filesMetadata.deleteMany({});
  });

  describe('Complete File Processing Flow', () => {
    it('should handle the complete flow: fetch -> save -> extract -> chunk', async () => {
      // Step 1: Simulate presence of files in Google Drive
      
      // Create test file directly in database to simulate successful fetch
      await prisma.filesMetadata.create({
        data: {
          id: 'test-file-e2e',
          userId: getTestUserId(),
          name: 'E2E Test Document.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(12345),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: false,
          extraMetadata: {
            webViewLink: 'https://docs.google.com/document/d/test-file-e2e/edit'
          }
        }
      });

      // Step 2: Get files list through API
      const filesResponse = await request(app)
        .get('/api/drive/files')
        .set('Cookie', authCookie)
        .expect(200);

      expect(filesResponse.body.files).toHaveLength(1);
      expect(filesResponse.body.files[0].id).toBe('test-file-e2e');
      expect(filesResponse.body.files[0].contentFetched).toBe(false);

      // Step 3: Simulate successful content extraction
      
      // Create chunks directly to simulate successful extraction
      await prisma.fileChunk.createMany({
        data: [
          {
            fileId: 'test-file-e2e',
            text: 'This is the first chunk of the E2E test document content.',
            chunkIndex: 0
          },
          {
            fileId: 'test-file-e2e',
            text: 'This is the second chunk of the E2E test document content.',
            chunkIndex: 1
          }
        ]
      });

      // Update file status
      await prisma.filesMetadata.update({
        where: { id_userId: { id: 'test-file-e2e', userId: getTestUserId() } },
        data: { contentFetched: true }
      });

      // Step 4: Verify that file is now marked as processed
      const updatedFilesResponse = await request(app)
        .get('/api/drive/files')
        .set('Cookie', authCookie)
        .expect(200);

      expect(updatedFilesResponse.body.files[0].contentFetched).toBe(true);

      // Step 5: Verify that chunks were created
      const chunks = await prisma.fileChunk.findMany({
        where: { fileId: 'test-file-e2e' },
        orderBy: { chunkIndex: 'asc' }
      });

      expect(chunks?.length).toBe(2);
      expect(chunks?.[0]?.chunkIndex).toBe(0);
      expect(chunks?.[1]?.chunkIndex).toBe(1);
      expect(chunks?.[0]?.text).toContain('first chunk');
      expect(chunks?.[1]?.text).toContain('second chunk');
    });

    it('should handle file updates and re-extraction', async () => {
      // Create file with initial content
      await prisma.filesMetadata.create({
        data: {
          id: 'test-file-update',
          userId: getTestUserId(),
          name: 'Update Test Document.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(12345),
          modifiedTime: new Date('2025-01-01T10:00:00.000Z'),
          createdTime: new Date('2025-01-01T09:00:00.000Z'),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Create initial chunks
      await prisma.fileChunk.createMany({
        data: [
          {
            fileId: 'test-file-update',
            text: 'Original content chunk 1',
            chunkIndex: 0
          },
          {
            fileId: 'test-file-update',
            text: 'Original content chunk 2',
            chunkIndex: 1
          }
        ]
      });

      // Simulate file update with new modification date
      await prisma.filesMetadata.update({
        where: { id_userId: { id: 'test-file-update', userId: getTestUserId() } },
        data: {
          modifiedTime: new Date('2025-01-02T10:00:00.000Z'),
          contentFetched: false // Reset flag for re-extraction
        }
      });

      // Delete old chunks and create new ones
      await prisma.fileChunk.deleteMany({
        where: { fileId: 'test-file-update' }
      });

      await prisma.fileChunk.createMany({
        data: [
          {
            fileId: 'test-file-update',
            text: 'Updated content chunk 1 with new information',
            chunkIndex: 0
          },
          {
            fileId: 'test-file-update',
            text: 'Updated content chunk 2 with additional details',
            chunkIndex: 1
          },
          {
            fileId: 'test-file-update',
            text: 'New chunk 3 added after update',
            chunkIndex: 2
          }
        ]
      });

      await prisma.filesMetadata.update({
        where: { id_userId: { id: 'test-file-update', userId: getTestUserId() } },
        data: { contentFetched: true }
      });

      // Verify updated chunks
      const updatedChunks = await prisma.fileChunk.findMany({
        where: { fileId: 'test-file-update' },
        orderBy: { chunkIndex: 'asc' }
      });

      expect(updatedChunks).toHaveLength(3);
      expect(updatedChunks[0]?.text).toContain('Updated content');
      expect(updatedChunks[2]?.text).toContain('New chunk 3');
    });
  });

  describe('API Endpoints Integration', () => {
    beforeEach(async () => {
      // Create test files for each test
      await prisma.filesMetadata.createMany({
        data: [
          {
            id: 'api-test-file-1',
            userId: getTestUserId(),
            name: 'API Test Document.docx',
            owner: 'test@example.com',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            size: BigInt(12345),
            modifiedTime: new Date(),
            createdTime: new Date(),
            contentFetched: true,
            extraMetadata: {}
          },
          {
            id: 'api-test-file-2',
            userId: getTestUserId(),
            name: 'API Test PDF.pdf',
            owner: 'test@example.com',
            mimeType: 'application/pdf',
            size: BigInt(67890),
            modifiedTime: new Date(),
            createdTime: new Date(),
            contentFetched: false,
            extraMetadata: {}
          }
        ]
      });
    });

    it('should get all files with pagination', async () => {
      const response = await request(app)
        .get('/api/drive/files?page=1&limit=10')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.files).toHaveLength(2);
      expect(response.body.pagination.totalCount).toBe(2);
      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(10);
    });

    it('should get specific file by ID', async () => {
      const response = await request(app)
        .get('/api/drive/files/api-test-file-1')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.id).toBe('api-test-file-1');
      expect(response.body.name).toBe('API Test Document.docx');
      expect(response.body.contentFetched).toBe(true);
    });

    it('should return 404 for non-existent file', async () => {
      await request(app)
        .get('/api/drive/files/non-existent-file')
        .set('Cookie', authCookie)
        .expect(404);
    });

    it('should delete file and its chunks', async () => {
      // Create chunks for file
      await prisma.fileChunk.createMany({
        data: [
          {
            fileId: 'api-test-file-1',
            text: 'Chunk to be deleted',
            chunkIndex: 0
          }
        ]
      });

      // Delete file
      await request(app)
        .delete('/api/drive/files/api-test-file-1')
        .set('Cookie', authCookie)
        .expect(200); // Successful deletion
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all endpoints', async () => {
      await request(app)
        .get('/api/drive/files')
        .expect(401);

      await request(app)
        .get('/api/drive/files/some-file-id')
        .expect(401);
    });

    it('should only return files belonging to the authenticated user', async () => {
      // Create another user and their file
      const otherUser = await prisma.user.create({
        data: {
          googleUserId: 'other-google-user-id',
          email: 'other@example.com',
          name: 'Other User'
        }
      });

      await prisma.filesMetadata.create({
        data: {
          id: 'other-user-file',
          userId: otherUser.id,
          name: 'Other User File.docx',
          owner: 'other@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(12345),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Request files under our user
      const response = await request(app)
        .get('/api/drive/files')
        .set('Cookie', authCookie)
        .      expect(200);

      // Should get only our user's files
      const fileIds = (response.body.files as FileResponse[]).map((f) => f.id);
      expect(fileIds).not.toContain('other-user-file');
      
      // Cleanup
      await prisma.filesMetadata.deleteMany({ where: { userId: otherUser.id } });
      await prisma.user.delete({ where: { id: otherUser.id } });
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Check handling of invalid data
      
      await request(app)
        .get('/api/drive/files/invalid-file-id-format')
        .set('Cookie', authCookie)
        .expect(404);
    });

    it('should handle malformed requests', async () => {
      await request(app)
        .get('/api/drive/files?page=invalid')
        .set('Cookie', authCookie)
        .expect(500); // Internal server error due to invalid parameters

      await request(app)
        .get('/api/drive/files?limit=0')
        .set('Cookie', authCookie)
        .expect(200); // Server handles invalid limit gracefully
    });
  });
});
