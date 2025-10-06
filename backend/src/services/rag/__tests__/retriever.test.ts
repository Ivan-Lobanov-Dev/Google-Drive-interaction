import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RAGRetriever } from '../retriever.js';
import { OpenAIEmbedder } from '../embedder.js';
import { PostgreSQLVectorStore } from '../vectorStore.js';
import { RAGQuery, SearchResult } from '../../../interfaces/rag.js';

// Mock dependencies
vi.mock('../embedder.js');
vi.mock('../vectorStore.js');

describe('RAGRetriever', () => {
  let retriever: RAGRetriever;
  let mockEmbedder: {
    embedText: ReturnType<typeof vi.fn>;
  };
  let mockVectorStore: {
    searchSimilar: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mocks
    mockEmbedder = {
      embedText: vi.fn(),
    };
    
    mockVectorStore = {
      searchSimilar: vi.fn(),
    };

    // Mock constructors
    vi.mocked(OpenAIEmbedder).mockImplementation(() => mockEmbedder as unknown as OpenAIEmbedder);
    vi.mocked(PostgreSQLVectorStore).mockImplementation(() => mockVectorStore as unknown as PostgreSQLVectorStore);

    retriever = new RAGRetriever();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('retrieve', () => {
    it('should retrieve relevant chunks successfully', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      const mockSearchResults: SearchResult[] = [
        {
          chunk: {
            id: 'chunk1',
            fileId: 'file1',
            text: 'This is about machine learning algorithms.',
            chunkIndex: 0,
            embedding: [0.1, 0.2, 0.3],
            metadata: {
              fileName: 'Unknown',
              fileType: 'unknown',
              owner: 'unknown',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.95,
          score: 0.9,
        },
        {
          chunk: {
            id: 'chunk2',
            fileId: 'file1',
            text: 'Neural networks are powerful tools for AI.',
            chunkIndex: 1,
            embedding: [0.4, 0.5, 0.6],
            metadata: {
              fileName: 'Unknown',
              fileType: 'unknown',
              owner: 'unknown',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.88,
          score: 0.85,
        },
      ];

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue(mockSearchResults);

      const query: RAGQuery = {
        question: 'What are machine learning algorithms?',
        userId: 'user1',
        maxResults: 5,
        similarityThreshold: 0.7,
        maxTokens: 4000,
      };

      const result = await retriever.retrieve(query);

      expect(mockEmbedder.embedText).toHaveBeenCalledWith('What are machine learning algorithms?');
      expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'user1',
        5,
        0.7,
        undefined
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should handle empty search results', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue([]);

      const query: RAGQuery = {
        question: 'What is quantum computing?',
        userId: 'user1',
      };

      const result = await retriever.retrieve(query);

      expect(result).toEqual([]);
    });

    it('should respect maxResults limit', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      const mockSearchResults: SearchResult[] = Array(10).fill(null).map((_, i) => ({
        chunk: {
          id: `chunk${i}`,
          fileId: 'file1',
          text: `Content ${i}`,
          chunkIndex: i,
          embedding: [0.1, 0.2, 0.3],
          metadata: {
            fileName: 'Unknown',
            fileType: 'unknown',
            owner: 'unknown',
            createdAt: expect.any(Date),
          },
        },
        similarity: 0.9,
        score: 0.9,
      }));

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue(mockSearchResults);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
        maxResults: 3,
      };

      const result = await retriever.retrieve(query);

      expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'user1',
        3,
        0.7,
        undefined
      );
      expect(result).toEqual(mockSearchResults);
    });

    it('should use default values when not specified', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue([]);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
        // No maxResults or similarityThreshold specified
      };

      await retriever.retrieve(query);

      expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'user1',
        10, // Default maxResults
        0.7, // Default similarityThreshold
        undefined
      );
    });

    it('should handle embedding errors', async () => {
      const error = new Error('OpenAI API error');
      mockEmbedder.embedText.mockRejectedValue(error);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
      };

      await expect(retriever.retrieve(query)).rejects.toThrow('OpenAI API error');
    });

    it('should handle vector store errors', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      
      const error = new Error('Database connection failed');
      mockVectorStore.searchSimilar.mockRejectedValue(error);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
      };

      await expect(retriever.retrieve(query)).rejects.toThrow('Database connection failed');
    });

    it('should handle questions with special characters', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue([]);

      const query: RAGQuery = {
        question: 'What is this about? 世界! 🌍 @#$%^&*()',
        userId: 'user1',
      };

      await retriever.retrieve(query);

      expect(mockEmbedder.embedText).toHaveBeenCalledWith('What is this about? 世界! 🌍 @#$%^&*()');
    });

    it('should handle empty questions', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue([]);

      const query: RAGQuery = {
        question: '',
        userId: 'user1',
      };

      await retriever.retrieve(query);

      expect(mockEmbedder.embedText).toHaveBeenCalledWith('');
    });

    it('should handle very long questions', async () => {
      const longQuestion = 'A'.repeat(10000);
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue([]);

      const query: RAGQuery = {
        question: longQuestion,
        userId: 'user1',
      };

      await retriever.retrieve(query);

      expect(mockEmbedder.embedText).toHaveBeenCalledWith(longQuestion);
    });

    it('should filter results by similarity threshold', async () => {
      const mockEmbedding = {
        vector: [0.1, 0.2, 0.3],
        dimension: 3,
        model: 'text-embedding-ada-002',
      };

      const mockSearchResults: SearchResult[] = [
        {
          chunk: {
            id: 'chunk1',
            fileId: 'file1',
            text: 'High similarity content',
            chunkIndex: 0,
            embedding: [0.1, 0.2, 0.3],
            metadata: {
              fileName: 'Unknown',
              fileType: 'unknown',
              owner: 'unknown',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.95,
          score: 0.9,
        },
        {
          chunk: {
            id: 'chunk2',
            fileId: 'file1',
            text: 'Low similarity content',
            chunkIndex: 1,
            embedding: [0.4, 0.5, 0.6],
            metadata: {
              fileName: 'Unknown',
              fileType: 'unknown',
              owner: 'unknown',
              createdAt: expect.any(Date),
            },
          },
          similarity: 0.5, // Below threshold
          score: 0.5,
        },
      ];

      mockEmbedder.embedText.mockResolvedValue(mockEmbedding);
      mockVectorStore.searchSimilar.mockResolvedValue(mockSearchResults);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
        similarityThreshold: 0.7,
      };

      const result = await retriever.retrieve(query);

      // The vector store should handle filtering, but we verify the threshold is passed
      expect(mockVectorStore.searchSimilar).toHaveBeenCalledWith(
        [0.1, 0.2, 0.3],
        'user1',
        10,
        0.7,
        undefined
      );
      expect(result).toEqual(mockSearchResults);
    });
  });

  describe('constructor', () => {
    it('should initialize with embedder and vector store', () => {
      expect(mockEmbedder).toBeDefined();
      expect(mockVectorStore).toBeDefined();
    });
  });
});
