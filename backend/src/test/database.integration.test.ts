import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma.js';

// Integration tests for database operations
describe('Database Integration Tests', () => {
  const getTestUserId = (): string => {
    if (!global.testUserId) {
      throw new Error('Test user ID not available. Make sure setup.ts beforeEach has run.');
    }
    return global.testUserId;
  }; // Use the standard test user from setup.ts
  const testPrefix = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  describe('File Metadata Operations', () => {
    it('should create and retrieve file metadata', async () => {
      const fileData = {
        id: `${testPrefix}_file_1`,
        userId: getTestUserId(),
        name: 'Test Integration File.pdf',
        owner: `${testPrefix}@test.com`,
        mimeType: 'application/pdf',
        size: BigInt(12345),
        modifiedTime: new Date(),
        createdTime: new Date(),
        contentFetched: false,
        extraMetadata: {
          webViewLink: 'https://drive.google.com/file/d/test/view',
          thumbnailLink: 'https://example.com/thumb.jpg'
        }
      };

      // Create file
      const createdFile = await prisma.filesMetadata.create({
        data: fileData
      });

      expect(createdFile.id).toBe(fileData.id);
      expect(createdFile.name).toBe(fileData.name);
      expect(createdFile.mimeType).toBe(fileData.mimeType);
      expect(createdFile.contentFetched).toBe(false);

      // Retrieve file
      const retrievedFile = await prisma.filesMetadata.findUnique({
        where: {
          id_userId: {
            id: fileData.id,
            userId: getTestUserId()
          }
        }
      });

      expect(retrievedFile).toBeTruthy();
      expect(retrievedFile?.name).toBe(fileData.name);
      expect(retrievedFile?.extraMetadata).toEqual(fileData.extraMetadata);
    });

    it('should update file metadata', async () => {
      const fileId = `${testPrefix}_file_update`;
      
      // Create file
      await prisma.filesMetadata.create({
        data: {
          id: fileId,
          userId: getTestUserId(),
          name: 'Original Name.pdf',
          owner: `${testPrefix}@test.com`,
          mimeType: 'application/pdf',
          size: BigInt(12345),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: false,
          extraMetadata: {}
        }
      });

      // Update file
      const updatedFile = await prisma.filesMetadata.update({
        where: {
          id_userId: {
            id: fileId,
            userId: getTestUserId()
          }
        },
        data: {
          name: 'Updated Name.pdf',
          contentFetched: true
        }
      });

      expect(updatedFile.name).toBe('Updated Name.pdf');
      expect(updatedFile.contentFetched).toBe(true);
    });
  });

  describe('File Chunks Operations', () => {
    it('should create and retrieve file chunks', async () => {
      const fileId = `${testPrefix}_file_chunks`;
      
      // Create file
      await prisma.filesMetadata.create({
        data: {
          id: fileId,
          userId: getTestUserId(),
          name: 'File with Chunks.docx',
          owner: `${testPrefix}@test.com`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(54321),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Create chunks
      const chunksData = [
        {
          fileId: fileId,
          text: 'First chunk of content for integration testing.',
          chunkIndex: 0
        },
        {
          fileId: fileId,
          text: 'Second chunk with more detailed information about the test.',
          chunkIndex: 1
        },
        {
          fileId: fileId,
          text: 'Final chunk that concludes the test document content.',
          chunkIndex: 2
        }
      ];

      const createResult = await prisma.fileChunk.createMany({
        data: chunksData
      });

      expect(createResult.count).toBe(3);

      // Retrieve chunks
      const retrievedChunks = await prisma.fileChunk.findMany({
        where: { fileId: fileId },
        orderBy: { chunkIndex: 'asc' }
      });

      expect(retrievedChunks).toHaveLength(3);
      expect(retrievedChunks[0]!.chunkIndex).toBe(0);
      expect(retrievedChunks[1]!.chunkIndex).toBe(1);
      expect(retrievedChunks[2]!.chunkIndex).toBe(2);
      expect(retrievedChunks[0]!.text).toContain('First chunk');
      expect(retrievedChunks[2]!.text).toContain('Final chunk');
    });

    it('should handle cascade deletion', async () => {
      const fileId = `${testPrefix}_file_cascade`;
      
      // Create file with chunks
      await prisma.filesMetadata.create({
        data: {
          id: fileId,
          userId: getTestUserId(),
          name: 'File for Cascade Test.docx',
          owner: `${testPrefix}@test.com`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(11111),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      await prisma.fileChunk.createMany({
        data: [
          { fileId: fileId, text: 'Chunk 1 for cascade test', chunkIndex: 0 },
          { fileId: fileId, text: 'Chunk 2 for cascade test', chunkIndex: 1 }
        ]
      });

      // Verify that chunks exist
      const chunksBeforeDelete = await prisma.fileChunk.findMany({
        where: { fileId: fileId }
      });
      expect(chunksBeforeDelete).toHaveLength(2);

      // Delete file
      await prisma.filesMetadata.delete({
        where: {
          id_userId: {
            id: fileId,
            userId: getTestUserId()
          }
        }
      });

      // Verify that chunks were also deleted (cascade)
      const chunksAfterDelete = await prisma.fileChunk.findMany({
        where: { fileId: fileId }
      });
      expect(chunksAfterDelete).toHaveLength(0);
    });
  });

  describe('Query Operations', () => {
    beforeEach(async () => {
      // Create test data for queries
      const filesData = Array.from({ length: 5 }, (_, i) => ({
        id: `${testPrefix}_query_file_${i}`,
        userId: getTestUserId(),
        name: `Query Test File ${i}.pdf`,
        owner: `${testPrefix}@test.com`,
        mimeType: 'application/pdf',
        size: BigInt(10000 + i * 1000),
        modifiedTime: new Date(Date.now() - i * 86400000), // Different dates
        createdTime: new Date(Date.now() - i * 86400000),
        contentFetched: i % 2 === 0, // Half processed
        extraMetadata: {}
      }));

      await prisma.filesMetadata.createMany({ data: filesData });
    });

    it('should query files by user efficiently', async () => {
      const startTime = Date.now();
      
      const userFiles = await prisma.filesMetadata.findMany({
        where: { userId: getTestUserId() },
        orderBy: { modifiedTime: 'desc' }
      });

      const queryTime = Date.now() - startTime;
      
      expect(userFiles).toHaveLength(5);
      expect(queryTime).toBeLessThan(100); // Should execute quickly
      
      // Verify sorting
      for (let i = 1; i < userFiles.length; i++) {
        expect(userFiles[i-1]!.modifiedTime.getTime()).toBeGreaterThanOrEqual(
          userFiles[i]!.modifiedTime.getTime()
        );
      }
    });

    it('should paginate files correctly', async () => {
      const pageSize = 2;
      
      const firstPage = await prisma.filesMetadata.findMany({
        where: { userId: getTestUserId() },
        orderBy: { modifiedTime: 'desc' },
        take: pageSize,
        skip: 0
      });

      const secondPage = await prisma.filesMetadata.findMany({
        where: { userId: getTestUserId() },
        orderBy: { modifiedTime: 'desc' },
        take: pageSize,
        skip: pageSize
      });

      expect(firstPage).toHaveLength(2);
      expect(secondPage).toHaveLength(2);
      expect(firstPage[0]!.id).not.toBe(secondPage[0]!.id);
    });

    it('should filter files by contentFetched status', async () => {
      const processedFiles = await prisma.filesMetadata.findMany({
        where: { 
          userId: getTestUserId(),
          contentFetched: true
        }
      });

      const unprocessedFiles = await prisma.filesMetadata.findMany({
        where: { 
          userId: getTestUserId(),
          contentFetched: false
        }
      });

      expect(processedFiles.length + unprocessedFiles.length).toBe(5);
      expect(processedFiles.length).toBeGreaterThan(0);
      expect(unprocessedFiles.length).toBeGreaterThan(0);
      
      processedFiles.forEach(file => {
        expect(file.contentFetched).toBe(true);
      });
      
      unprocessedFiles.forEach(file => {
        expect(file.contentFetched).toBe(false);
      });
    });
  });

  describe('Data Integrity', () => {
    it('should enforce unique constraint on file id and user id', async () => {
      const fileData = {
        id: `${testPrefix}_unique_test`,
        userId: getTestUserId(),
        name: 'Unique Test File.pdf',
        owner: `${testPrefix}@test.com`,
        mimeType: 'application/pdf',
        size: BigInt(12345),
        modifiedTime: new Date(),
        createdTime: new Date(),
        contentFetched: false,
        extraMetadata: {}
      };

      // Create first file
      await prisma.filesMetadata.create({ data: fileData });

      // Attempt to create duplicate should fail with error
      await expect(
        prisma.filesMetadata.create({ data: fileData })
      ).rejects.toThrow();
    });

    it('should handle JSON metadata correctly', async () => {
      const complexMetadata = {
        webViewLink: 'https://docs.google.com/document/d/test/edit',
        thumbnailLink: 'https://example.com/thumb.jpg',
        parents: ['folder1', 'folder2'],
        properties: {
          customField: 'customValue',
          tags: ['important', 'work']
        }
      };

      const file = await prisma.filesMetadata.create({
        data: {
          id: `${testPrefix}_json_test`,
          userId: getTestUserId(),
          name: 'JSON Metadata Test.docx',
          owner: `${testPrefix}@test.com`,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(67890),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: false,
          extraMetadata: complexMetadata
        }
      });

      expect(file.extraMetadata).toEqual(complexMetadata);
    });

    it('should handle large text chunks', async () => {
      const fileId = `${testPrefix}_large_chunk`;
      
      await prisma.filesMetadata.create({
        data: {
          id: fileId,
          userId: getTestUserId(),
          name: 'Large Chunk Test.pdf',
          owner: `${testPrefix}@test.com`,
          mimeType: 'application/pdf',
          size: BigInt(100000),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Create large chunk (5KB of text)
      const largeText = 'This is a large chunk of text for testing purposes. '.repeat(100);
      
      const chunk = await prisma.fileChunk.create({
        data: {
          fileId: fileId,
          text: largeText,
          chunkIndex: 0
        }
      });

      expect(chunk.text.length).toBeGreaterThan(5000);
      expect(chunk.text).toContain('large chunk of text');
    });
  });
});
