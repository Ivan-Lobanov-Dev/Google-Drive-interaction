import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RAGService } from '../ragService.js';
import { RAGOrchestratorImpl } from '../rag/ragOrchestrator.js';
import { OpenAIEmbedder } from '../rag/embedder.js';
import { PostgreSQLVectorStore } from '../rag/vectorStore.js';
import { prisma } from '../../lib/prisma.js';

// Mock dependencies
vi.mock('../rag/ragOrchestrator.js');
vi.mock('../rag/embedder.js');
vi.mock('../rag/vectorStore.js');
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    fileChunk: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('RAGService', () => {
  let ragService: RAGService;
  let mockOrchestrator: {
    processQuery: ReturnType<typeof vi.fn>;
    isReady: ReturnType<typeof vi.fn>;
    getStats: ReturnType<typeof vi.fn>;
  };
  let mockEmbedder: {
    embedBatch: ReturnType<typeof vi.fn>;
    embedText: ReturnType<typeof vi.fn>;
    getEmbeddingDimension: ReturnType<typeof vi.fn>;
  };
  let mockVectorStore: {
    deleteFileChunks: ReturnType<typeof vi.fn>;
    checkPgVectorExtension: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockOrchestrator = {
      processQuery: vi.fn(),
      isReady: vi.fn(),
      getStats: vi.fn(),
    };
    
    mockEmbedder = {
      embedBatch: vi.fn(),
      embedText: vi.fn(),
      getEmbeddingDimension: vi.fn(() => 1536),
    };
    
    mockVectorStore = {
      deleteFileChunks: vi.fn(),
      checkPgVectorExtension: vi.fn(),
    };

    // Mock constructors
    vi.mocked(RAGOrchestratorImpl).mockImplementation(() => mockOrchestrator as unknown as RAGOrchestratorImpl);
    vi.mocked(OpenAIEmbedder).mockImplementation(() => mockEmbedder as unknown as OpenAIEmbedder);
    vi.mocked(PostgreSQLVectorStore).mockImplementation(() => mockVectorStore as unknown as PostgreSQLVectorStore);

    ragService = new RAGService();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('answerQuestion', () => {
    it('should process a question successfully', async () => {
      const mockResponse = {
        answer: 'Test answer',
        confidence: 0.9,
        sources: [
          {
            fileName: 'test.pdf',
            chunkText: 'Test content',
            similarity: 0.95,
            fileId: 'file1',
          },
        ],
        totalChunksSearched: 10,
      };

      mockOrchestrator.processQuery.mockResolvedValue(mockResponse);

      const result = await ragService.answerQuestion('What is the test?', 'user1');

      expect(mockOrchestrator.processQuery).toHaveBeenCalledWith({
        question: 'What is the test?',
        userId: 'user1',
        maxResults: 10,
        similarityThreshold: 0.7,
        maxTokens: 5000,
      });
      expect(result).toEqual(mockResponse);
    });

    it('should handle questions with filters', async () => {
      const mockResponse = {
        answer: 'Filtered answer',
        confidence: 0.8,
        sources: [],
        totalChunksSearched: 5,
      };

      mockOrchestrator.processQuery.mockResolvedValue(mockResponse);

      const filters = {
        dateRange: {
          from: new Date('2024-01-01'),
          to: new Date('2024-12-31'),
        },
        owner: 'test@example.com',
      };

      await ragService.answerQuestion('What happened in 2024?', 'user1', filters);

      expect(mockOrchestrator.processQuery).toHaveBeenCalledWith({
        question: 'What happened in 2024?',
        userId: 'user1',
        maxResults: 10,
        similarityThreshold: 0.7,
        maxTokens: 5000,
        filters,
      });
    });

    it('should trim question whitespace', async () => {
      mockOrchestrator.processQuery.mockResolvedValue({
        answer: 'Answer',
        confidence: 0.8,
        sources: [],
        totalChunksSearched: 0,
      });

      await ragService.answerQuestion('  What is the test?  ', 'user1');

      expect(mockOrchestrator.processQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'What is the test?',
        })
      );
    });
  });

  describe('indexFile', () => {
    it('should index file chunks successfully', async () => {
      const mockChunks = [
        {
          id: 'chunk1',
          text: 'Test content 1',
          chunkIndex: 0,
          embedding: null,
        },
        {
          id: 'chunk2',
          text: 'Test content 2',
          chunkIndex: 1,
          embedding: null,
        },
      ];

      const mockEmbeddings = [
        { vector: [0.1, 0.2, 0.3], dimension: 3, model: 'text-embedding-ada-002' },
        { vector: [0.4, 0.5, 0.6], dimension: 3, model: 'text-embedding-ada-002' },
      ];

      // Add required fields to mockChunks to match the expected type
      const mockChunksWithFields = mockChunks.map((chunk) => ({
        ...chunk,
        fileId: 'file1',
        createdAt: new Date(),
      }));

      vi.mocked(prisma.fileChunk.findMany).mockResolvedValue(mockChunksWithFields);
      mockEmbedder.embedBatch.mockResolvedValue(mockEmbeddings);
      vi.mocked(prisma.fileChunk.update).mockResolvedValue({} as never);

      const result = await ragService.indexFile('file1', 'user1');

      expect(prisma.fileChunk.findMany).toHaveBeenCalledWith({
        where: { fileId: 'file1' },
        select: {
          id: true,
          text: true,
          chunkIndex: true,
          embedding: true,
        },
      });

      expect(mockEmbedder.embedBatch).toHaveBeenCalledWith(['Test content 1', 'Test content 2']);

      expect(prisma.fileChunk.update).toHaveBeenCalledTimes(2);
      expect(prisma.fileChunk.update).toHaveBeenCalledWith({
        where: { id: 'chunk1' },
        data: { embedding: JSON.stringify([0.1, 0.2, 0.3]) },
      });

      expect(result).toEqual({
        success: true,
        chunksIndexed: 2,
      });
    });

    it('should handle case when no chunks found', async () => {
      vi.mocked(prisma.fileChunk.findMany).mockResolvedValue([]);

      const result = await ragService.indexFile('file1', 'user1');

      expect(result).toEqual({
        success: false,
        chunksIndexed: 0,
        error: 'No chunks found for this file',
      });
    });

    it('should handle case when all chunks already have embeddings', async () => {
      const mockChunks = [
        {
          id: 'chunk1',
          text: 'Test content 1',
          chunkIndex: 0,
          embedding: JSON.stringify([0.1, 0.2, 0.3]),
        },
      ];

      // Add required fields to mockChunks to match the expected type
      const mockChunksWithFields = mockChunks.map(chunk => ({
        ...chunk,
        fileId: 'file1',
        createdAt: new Date(),
      }));

      vi.mocked(prisma.fileChunk.findMany).mockResolvedValue(mockChunksWithFields);

      const result = await ragService.indexFile('file1', 'user1');

      expect(result).toEqual({
        success: true,
        chunksIndexed: 0,
        error: 'All chunks already have embeddings',
      });
    });

    it('should handle embedding errors', async () => {
      const mockChunks = [
        {
          id: 'chunk1',
          text: 'Test content 1',
          chunkIndex: 0,
          embedding: null,
        },
      ];

      // Add required fields to mockChunks to match the expected type
      const mockChunksWithFields = mockChunks.map(chunk => ({
        ...chunk,
        fileId: 'file1',
        createdAt: new Date(),
      }));

      vi.mocked(prisma.fileChunk.findMany).mockResolvedValue(mockChunksWithFields);
      mockEmbedder.embedBatch.mockRejectedValue(new Error('Embedding failed'));

      const result = await ragService.indexFile('file1', 'user1');

      expect(result).toEqual({
        success: false,
        chunksIndexed: 0,
        error: 'Embedding failed',
      });
    });
  });

  describe('removeFile', () => {
    it('should remove file from RAG index successfully', async () => {
      mockVectorStore.deleteFileChunks.mockResolvedValue(undefined);

      await ragService.removeFile('file1');

      expect(mockVectorStore.deleteFileChunks).toHaveBeenCalledWith('file1');
    });

    it('should handle removal errors', async () => {
      const error = new Error('Database error');
      mockVectorStore.deleteFileChunks.mockRejectedValue(error);

      await expect(ragService.removeFile('file1')).rejects.toThrow('Database error');
    });
  });

  describe('isReady', () => {
    it('should check if RAG is ready for user', async () => {
      mockOrchestrator.isReady.mockResolvedValue(true);

      const result = await ragService.isReady('user1');

      expect(mockOrchestrator.isReady).toHaveBeenCalledWith('user1');
      expect(result).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should get RAG statistics for user', async () => {
      const mockStats = {
        indexedChunks: 100,
        totalChunks: 150,
        lastIndexed: new Date('2024-01-01'),
      };

      mockOrchestrator.getStats.mockResolvedValue(mockStats);

      const result = await ragService.getStats('user1');

      expect(mockOrchestrator.getStats).toHaveBeenCalledWith('user1');
      expect(result).toEqual(mockStats);
    });
  });

  describe('checkSystemHealth', () => {
    it('should check all system components successfully', async () => {
      mockVectorStore.checkPgVectorExtension.mockResolvedValue(true);
      mockEmbedder.embedText.mockResolvedValue({
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      });

      const result = await ragService.checkSystemHealth();

      expect(result).toEqual({
        pgvectorAvailable: true,
        openaiAvailable: true,
        databaseConnected: true,
      });
    });

    it('should handle component failures', async () => {
      mockVectorStore.checkPgVectorExtension.mockRejectedValue(new Error('PGVector not available'));
      mockEmbedder.embedText.mockRejectedValue(new Error('OpenAI API error'));

      const result = await ragService.checkSystemHealth();

      expect(result).toEqual({
        pgvectorAvailable: false,
        openaiAvailable: false,
        databaseConnected: true,
      });
    });
  });

  describe('getConfig', () => {
    it('should return RAG configuration with embedding dimension', () => {
      const config = ragService.getConfig();

      expect(config).toEqual({
        maxTokens: 5000,
        maxResults: 10,
        similarityThreshold: 0.7,
        embeddingModel: '1536',
        chunkSize: 800,
        chunkOverlap: 50,
      });
    });
  });
});
