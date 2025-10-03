import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../lib/prisma.js';

// Integration tests for database operations
describe('Content Extraction Integration Tests', () => {
  const getTestUserId = (): string => {
    if (!global.testUserId) {
      throw new Error('Test user ID not available. Make sure setup.ts beforeEach has run.');
    }
    return global.testUserId;
  }; // Use the standard test user from setup.ts

  describe('Database Operations', () => {
    it('should save file metadata to database', async () => {
      const fileData = {
        id: 'test-file-integration',
        userId: getTestUserId(),
        name: 'Integration Test File.pdf',
        owner: 'integration@test.com',
        mimeType: 'application/pdf',
        size: BigInt(12345),
        modifiedTime: new Date(),
        createdTime: new Date(),
        contentFetched: false,
        extraMetadata: {
          webViewLink: 'https://drive.google.com/file/d/test-file-integration/view'
        }
      };

      const savedFile = await prisma.filesMetadata.create({
        data: fileData
      });

      expect(savedFile.id).toBe('test-file-integration');
      expect(savedFile.name).toBe('Integration Test File.pdf');
      expect(savedFile.mimeType).toBe('application/pdf');
      expect(savedFile.contentFetched).toBe(false);
    });

    it('should save file chunks to database', async () => {
      // First create the file
      await prisma.filesMetadata.create({
        data: {
          id: 'test-file-chunks',
          userId: getTestUserId(),
          name: 'Test File with Chunks.docx',
          owner: 'integration@test.com',
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
          fileId: 'test-file-chunks',
          text: 'This is the first chunk of content from the integration test.',
          chunkIndex: 0
        },
        {
          fileId: 'test-file-chunks',
          text: 'This is the second chunk of content with more detailed information.',
          chunkIndex: 1
        },
        {
          fileId: 'test-file-chunks',
          text: 'This is the final chunk that concludes the document content.',
          chunkIndex: 2
        }
      ];

      const result = await prisma.fileChunk.createMany({
        data: chunksData
      });

      expect(result.count).toBe(3);

      // Verify that chunks were saved correctly
      const savedChunks = await prisma.fileChunk.findMany({
        where: { fileId: 'test-file-chunks' },
        orderBy: { chunkIndex: 'asc' }
      });

      expect(savedChunks).toHaveLength(3);
      expect(savedChunks[0]!.chunkIndex).toBe(0);
      expect(savedChunks[1]!.chunkIndex).toBe(1);
      expect(savedChunks[2]!.chunkIndex).toBe(2);
      expect(savedChunks[0]!.text).toContain('first chunk');
      expect(savedChunks[2]!.text).toContain('final chunk');
    });

    it('should update file metadata when content is processed', async () => {
      // Create file without processed content
      const file = await prisma.filesMetadata.create({
        data: {
          id: 'test-file-update',
          userId: getTestUserId(),
          name: 'File to Update.pdf',
          owner: 'integration@test.com',
          mimeType: 'application/pdf',
          size: BigInt(98765),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: false,
          extraMetadata: {}
        }
      });

      expect(file.contentFetched).toBe(false);

      // Update status after content processing
      const updatedFile = await prisma.filesMetadata.update({
        where: { 
          id_userId: {
            id: 'test-file-update',
            userId: getTestUserId()
          }
        },
        data: { contentFetched: true }
      });

      expect(updatedFile.contentFetched).toBe(true);
    });

    it('should handle file deletion with cascade', async () => {
      // Create file with chunks
      await prisma.filesMetadata.create({
        data: {
          id: 'test-file-cascade',
          userId: getTestUserId(),
          name: 'File for Cascade Test.docx',
          owner: 'integration@test.com',
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
          { fileId: 'test-file-cascade', text: 'Chunk 1', chunkIndex: 0 },
          { fileId: 'test-file-cascade', text: 'Chunk 2', chunkIndex: 1 }
        ]
      });

      // Verify that file and chunks exist
      const fileExists = await prisma.filesMetadata.findFirst({
        where: { id: 'test-file-cascade', userId: getTestUserId() }
      });
      const chunksExist = await prisma.fileChunk.findMany({
        where: { fileId: 'test-file-cascade' }
      });

      expect(fileExists).toBeTruthy();
      expect(chunksExist).toHaveLength(2);

      // Delete file
      await prisma.filesMetadata.delete({
        where: {
          id_userId: {
            id: 'test-file-cascade',
            userId: getTestUserId()
          }
        }
      });

      // Verify that chunks were also deleted (cascade)
      const remainingChunks = await prisma.fileChunk.findMany({
        where: { fileId: 'test-file-cascade' }
      });

      expect(remainingChunks).toHaveLength(0);
    });
  });

  describe('Query Performance', () => {
    beforeEach(async () => {
      // Create test data for performance testing
      const filesData = Array.from({ length: 10 }, (_, i) => ({
        id: `perf-test-file-${i}`,
        userId: getTestUserId(),
        name: `Performance Test File ${i}.pdf`,
        owner: 'integration@test.com',
        mimeType: 'application/pdf',
        size: BigInt(10000 + i * 1000),
        modifiedTime: new Date(Date.now() - i * 86400000), // Different dates
        createdTime: new Date(Date.now() - i * 86400000),
        contentFetched: i % 2 === 0, // Half processed
        extraMetadata: {}
      }));

      await prisma.filesMetadata.createMany({ data: filesData });

      // Create chunks for processed files
      const chunksData = [];
      for (let i = 0; i < 10; i += 2) {
        for (let j = 0; j < 5; j++) {
          chunksData.push({
            fileId: `perf-test-file-${i}`,
            text: `Chunk ${j} for file ${i} with some content to test performance`,
            chunkIndex: j
          });
        }
      }

      await prisma.fileChunk.createMany({ data: chunksData });
    });

    it('should efficiently query files by user', async () => {
      const startTime = Date.now();
      
      const userFiles = await prisma.filesMetadata.findMany({
        where: { userId: getTestUserId() },
        orderBy: { modifiedTime: 'desc' }
      });

      const queryTime = Date.now() - startTime;
      
      expect(userFiles).toHaveLength(10);
      expect(queryTime).toBeLessThan(100); // Should execute quickly
    });

    it('should efficiently query files with chunks', async () => {
      const startTime = Date.now();
      
      const filesWithChunks = await prisma.filesMetadata.findMany({
        where: { 
          userId: getTestUserId(),
          contentFetched: true
        },
        include: {
          chunks: {
            orderBy: { chunkIndex: 'asc' }
          }
        }
      });

      const queryTime = Date.now() - startTime;
      
      expect(filesWithChunks).toHaveLength(5); // Half of files processed
      expect(filesWithChunks[0]!.chunks).toHaveLength(5);
      expect(queryTime).toBeLessThan(200);
    });

    it('should efficiently paginate files', async () => {
      const pageSize = 3;
      const startTime = Date.now();
      
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

      const queryTime = Date.now() - startTime;
      
      expect(firstPage).toHaveLength(3);
      expect(secondPage).toHaveLength(3);
      expect(firstPage[0]!.id).not.toBe(secondPage[0]!.id);
      expect(queryTime).toBeLessThan(150);
    });
  });

  describe('Data Integrity', () => {
    it('should enforce unique constraint on file id and user id', async () => {
      const fileData = {
        id: 'duplicate-test-file',
        userId: getTestUserId(),
        name: 'Duplicate Test File.pdf',
        owner: 'integration@test.com',
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

    it('should handle large text chunks', async () => {
      await prisma.filesMetadata.create({
        data: {
          id: 'large-chunk-test',
          userId: getTestUserId(),
          name: 'Large Chunk Test.pdf',
          owner: 'integration@test.com',
          mimeType: 'application/pdf',
          size: BigInt(100000),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Create large chunk (10KB of text)
      const largeText = 'This is a large chunk of text. '.repeat(300);
      
      const chunk = await prisma.fileChunk.create({
        data: {
          fileId: 'large-chunk-test',
          text: largeText,
          chunkIndex: 0
        }
      });

      expect(chunk.text.length).toBeGreaterThan(9000);
      expect(chunk.text).toContain('large chunk of text');
    });

    it('should handle JSON metadata correctly', async () => {
      const complexMetadata = {
        webViewLink: 'https://docs.google.com/document/d/test/edit',
        thumbnailLink: 'https://example.com/thumb.jpg',
        parents: ['folder1', 'folder2'],
        permissions: [
          { role: 'owner', type: 'user', emailAddress: 'owner@test.com' },
          { role: 'reader', type: 'user', emailAddress: 'reader@test.com' }
        ],
        properties: {
          customField: 'customValue',
          tags: ['important', 'work']
        }
      };

      const file = await prisma.filesMetadata.create({
        data: {
          id: 'json-metadata-test',
          userId: getTestUserId(),
          name: 'JSON Metadata Test.docx',
          owner: 'integration@test.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(67890),
          modifiedTime: new Date(),
          createdTime: new Date(),
          contentFetched: false,
          extraMetadata: complexMetadata,
          permissions: complexMetadata.permissions
        }
      });

      expect(file.extraMetadata).toEqual(complexMetadata);
      expect(file.permissions).toEqual(complexMetadata.permissions);
    });
  });
});
