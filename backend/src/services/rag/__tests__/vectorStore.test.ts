import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { PostgreSQLVectorStore } from '../vectorStore.js';
import { Chunk } from '../../../interfaces/rag.js';
import { prisma } from '../../../lib/prisma.js';

// Mock Prisma
vi.mock('../../../lib/prisma.js', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    fileChunk: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
}));

describe('PostgreSQLVectorStore', () => {
  let vectorStore: PostgreSQLVectorStore;

  beforeEach(() => {
    vi.clearAllMocks();
    vectorStore = new PostgreSQLVectorStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storeChunks', () => {
    it('should store chunks with embeddings successfully', async () => {
      const chunks: Chunk[] = [
        {
          id: 'chunk1',
          fileId: 'file1',
          text: 'Test content 1',
          chunkIndex: 0,
          embedding: [0.1, 0.2, 0.3],
          metadata: {
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: new Date('2024-01-01'),
          },
        },
        {
          id: 'chunk2',
          fileId: 'file1',
          text: 'Test content 2',
          chunkIndex: 1,
          embedding: [0.4, 0.5, 0.6],
          metadata: {
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: new Date('2024-01-01'),
          },
        },
      ];

      vi.mocked(prisma.fileChunk.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.fileChunk.createMany).mockResolvedValue({ count: 2 });

      await vectorStore.storeChunks(chunks);

      expect(prisma.fileChunk.deleteMany).toHaveBeenCalledWith({
        where: {
          fileId: {
            in: ['file1']
          }
        }
      });

      expect(prisma.fileChunk.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'chunk1',
            fileId: 'file1',
            text: 'Test content 1',
            chunkIndex: 0,
            embedding: expect.any(String),
          }),
          expect.objectContaining({
            id: 'chunk2',
            fileId: 'file1',
            text: 'Test content 2',
            chunkIndex: 1,
            embedding: expect.any(String),
          }),
        ])
      });
    });

    it('should handle chunks without embeddings', async () => {
      const chunks: Chunk[] = [
        {
          id: 'chunk1',
          fileId: 'file1',
          text: 'Test content 1',
          chunkIndex: 0,
          // No embedding
        },
      ];

      vi.mocked(prisma.fileChunk.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.fileChunk.createMany).mockResolvedValue({ count: 1 });

      await vectorStore.storeChunks(chunks);

      expect(prisma.fileChunk.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            id: 'chunk1',
            fileId: 'file1',
            text: 'Test content 1',
            chunkIndex: 0,
            embedding: null,
          }),
        ])
      });
    });

    it('should handle empty chunks array', async () => {
      await vectorStore.storeChunks([]);
      expect(prisma.fileChunk.createMany).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const chunks: Chunk[] = [
        {
          id: 'chunk1',
          fileId: 'file1',
          text: 'Test content 1',
          chunkIndex: 0,
          embedding: [0.1, 0.2, 0.3],
        },
      ];

      const error = new Error('Database connection failed');
      vi.mocked(prisma.fileChunk.createMany).mockRejectedValue(error);

      await expect(vectorStore.storeChunks(chunks)).rejects.toThrow('Failed to store chunks: Database connection failed');
    });
  });

  describe('searchSimilar', () => {
    it('should search for similar chunks successfully', async () => {
      const mockResults = [
        {
          id: 'chunk1',
          file_id: 'file1',
          text: 'Test content 1',
          chunk_index: 0,
          embedding: JSON.stringify([0.1, 0.2, 0.3]),
          metadata: JSON.stringify({
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: '2024-01-01T00:00:00.000Z',
          }),
          similarity: 0.95,
        },
        {
          id: 'chunk2',
          file_id: 'file1',
          text: 'Test content 2',
          chunk_index: 1,
          embedding: JSON.stringify([0.4, 0.5, 0.6]),
          metadata: JSON.stringify({
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: '2024-01-01T00:00:00.000Z',
          }),
          similarity: 0.88,
        },
      ];

      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockResults);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const result = await vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.7);

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.any(Array),
        JSON.stringify(queryEmbedding),
        'fm.userId = \'user1\' AND fc.embedding IS NOT NULL',
        JSON.stringify(queryEmbedding),
        0.7,
        JSON.stringify(queryEmbedding),
        5
      );

      expect(result).toEqual([
        {
          chunk: {
            id: 'chunk1',
            fileId: undefined,
            text: 'Test content 1',
            chunkIndex: undefined,
            embedding: [0.1, 0.2, 0.3],
            metadata: {
              fileName: '',
              fileType: '',
              owner: 'user1',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.95,
          score: 0.95,
        },
        {
          chunk: {
            id: 'chunk2',
            fileId: undefined,
            text: 'Test content 2',
            chunkIndex: undefined,
            embedding: [0.4, 0.5, 0.6],
            metadata: {
              fileName: '',
              fileType: '',
              owner: 'user1',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.88,
          score: 0.88,
        },
      ]);
    });

    it('should handle empty search results', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const result = await vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.9);

      expect(result).toEqual([]);
    });

    it('should handle search errors', async () => {
      const error = new Error('Vector search failed');
      vi.mocked(prisma.$queryRaw).mockRejectedValue(error);

      const queryEmbedding = [0.1, 0.2, 0.3];
      await expect(vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.7)).rejects.toThrow('Vector search failed');
    });

    it('should handle malformed metadata gracefully', async () => {
      const mockResults = [
        {
          id: 'chunk1',
          file_id: 'file1',
          text: 'Test content 1',
          chunk_index: 0,
          embedding: JSON.stringify([0.1, 0.2, 0.3]),
          metadata: 'invalid-json',
          similarity: 0.95,
        },
      ];

      vi.mocked(prisma.$queryRaw).mockResolvedValue(mockResults);

      const queryEmbedding = [0.1, 0.2, 0.3];
      const result = await vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.7);

      expect(result[0]?.chunk.metadata).toEqual({
        fileName: '',
        fileType: '',
        owner: 'user1',
        createdAt: expect.any(Date),
      });
    });
  });

  describe('deleteFileChunks', () => {
    it('should delete chunks for a specific file', async () => {
      vi.mocked(prisma.fileChunk.deleteMany).mockResolvedValue({ count: 5 });

      await vectorStore.deleteFileChunks('file1');

      expect(prisma.fileChunk.deleteMany).toHaveBeenCalledWith({
        where: {
          fileId: 'file1',
        },
      });
    });

    it('should handle deletion errors', async () => {
      const error = new Error('Deletion failed');
      vi.mocked(prisma.fileChunk.deleteMany).mockRejectedValue(error);

      await expect(vectorStore.deleteFileChunks('file1')).rejects.toThrow('Deletion failed');
    });

    it('should handle case when no chunks exist for file', async () => {
      vi.mocked(prisma.fileChunk.deleteMany).mockResolvedValue({ count: 0 });

      await vectorStore.deleteFileChunks('nonexistent-file');

      expect(prisma.fileChunk.deleteMany).toHaveBeenCalledWith({
        where: {
          fileId: 'nonexistent-file',
        },
      });
    });
  });

  describe('checkPgVectorExtension', () => {
    it('should return true when pgvector extension is available', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([{ extname: 'vector' }]);

      const result = await vectorStore.checkPgVectorExtension();

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.stringContaining('SELECT extname FROM pg_extension WHERE extname = \'vector\'')
        ])
      );
      expect(result).toBe(true);
    });

    it('should return false when pgvector extension is not available', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      const result = await vectorStore.checkPgVectorExtension();

      expect(result).toBe(false);
    });

    it('should handle database errors when checking extension', async () => {
      const error = new Error('Database connection failed');
      vi.mocked(prisma.$queryRaw).mockRejectedValue(error);

      const result = await vectorStore.checkPgVectorExtension();
      expect(result).toBe(false);
    });
  });

  describe('vector operations', () => {
    it('should handle different embedding dimensions', async () => {
      const chunks: Chunk[] = [
        {
          id: 'chunk1',
          fileId: 'file1',
          text: 'Test content',
          chunkIndex: 0,
          embedding: Array(1536).fill(0.1), // 1536-dimensional embedding
        },
      ];

      vi.mocked(prisma.fileChunk.deleteMany).mockResolvedValue({ count: 0 });
      vi.mocked(prisma.fileChunk.createMany).mockResolvedValue({ count: 1 });

      await vectorStore.storeChunks(chunks);

      expect(prisma.fileChunk.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            embedding: expect.stringContaining('0.1'),
          }),
        ])
      });
    });

    it('should handle similarity search with different thresholds', async () => {
      vi.mocked(prisma.$queryRaw).mockResolvedValue([]);

      const queryEmbedding = [0.1, 0.2, 0.3];
      
      // Test with high threshold
      await vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.95);
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        0.95,
        expect.any(String),
        5
      );

      // Test with low threshold
      await vectorStore.searchSimilar(queryEmbedding, 'user1', 5, 0.1);
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        0.1,
        expect.any(String),
        5
      );
    });
  });
});
