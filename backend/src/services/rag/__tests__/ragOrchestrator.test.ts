import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RAGOrchestratorImpl } from '../ragOrchestrator.js';
import { RAGRetriever } from '../retriever.js';
import { RAGQuery } from '../../../interfaces/rag.js';

// Mock dependencies
vi.mock('../retriever.js');
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: vi.fn(),
      },
    },
  })),
}));

describe('RAGOrchestratorImpl', () => {
  let orchestrator: RAGOrchestratorImpl;
  let mockRetriever: {
    retrieve: ReturnType<typeof vi.fn>;
    hasIndexedContent: ReturnType<typeof vi.fn>;
    getRetrievalStats: ReturnType<typeof vi.fn>;
  };
  let mockOpenAI: {
    chat: {
      completions: {
        create: ReturnType<typeof vi.fn>;
      };
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup environment
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Setup mocks
    mockRetriever = {
      retrieve: vi.fn(),
      hasIndexedContent: vi.fn(),
      getRetrievalStats: vi.fn(),
    };
    
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn(),
        },
      },
    };

    // Mock constructors
    vi.mocked(RAGRetriever).mockImplementation(() => mockRetriever as unknown as RAGRetriever);
    
    orchestrator = new RAGOrchestratorImpl();
    // Replace the OpenAI instance with our mock
    (orchestrator as unknown as { openai: typeof mockOpenAI }).openai = mockOpenAI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe('processQuery', () => {
    it('should process query successfully with relevant chunks', async () => {
      const mockSearchResults = [
        {
          chunk: {
            id: 'chunk1',
            fileId: 'file1',
            text: 'This is about machine learning algorithms.',
            chunkIndex: 0,
            metadata: {
              fileName: 'ml-guide.pdf',
              fileType: 'application/pdf',
              owner: 'user@example.com',
              createdAt: new Date('2024-01-01'),
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
            metadata: {
              fileName: 'ml-guide.pdf',
              fileType: 'application/pdf',
              owner: 'user@example.com',
              createdAt: new Date('2024-01-01'),
            },
          },
          similarity: 0.88,
          score: 0.85,
        },
      ];

      const mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: 'Machine learning algorithms, including neural networks, are powerful tools for artificial intelligence applications.',
            },
          },
        ],
        usage: {
          total_tokens: 150,
        },
      };

      mockRetriever.retrieve.mockResolvedValue(mockSearchResults);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockOpenAIResponse);

      const query: RAGQuery = {
        question: 'What are machine learning algorithms?',
        userId: 'user1',
        maxResults: 5,
        similarityThreshold: 0.7,
        maxTokens: 4000,
      };

      const result = await orchestrator.processQuery(query);

      expect(mockRetriever.retrieve).toHaveBeenCalledWith(query);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: expect.stringContaining('You are an AI assistant that answers questions based on provided document content'),
          },
          {
            role: 'user',
            content: expect.stringContaining('What are machine learning algorithms?'),
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      });

      expect(result).toEqual({
        answer: 'Machine learning algorithms, including neural networks, are powerful tools for artificial intelligence applications.',
        confidence: expect.any(Number),
        sources: [
          {
            fileName: 'ml-guide.pdf',
            chunkText: 'This is about machine learning algorithms.',
            similarity: 0.95,
            fileId: 'file1',
          },
          {
            fileName: 'ml-guide.pdf',
            chunkText: 'Neural networks are powerful tools for AI.',
            similarity: 0.88,
            fileId: 'file1',
          },
        ],
        reasoning: expect.any(String),
        totalChunksSearched: 2,
        tokensUsed: expect.any(Number),
      });
    });

    it('should handle case when no relevant chunks found', async () => {
      mockRetriever.retrieve.mockResolvedValue([]);

      const query: RAGQuery = {
        question: 'What is quantum computing?',
        userId: 'user1',
      };

      const result = await orchestrator.processQuery(query);

      expect(result).toEqual({
        answer: "I couldn't find any relevant content in your documents to answer this question.",
        confidence: 0.0,
        sources: [],
        reasoning: 'No relevant chunks found in vector search',
        totalChunksSearched: 0,
      });

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle safety check failure when tokens exceed limit', async () => {
      const mockSearchResults = Array(100).fill(null).map((_, i) => ({
        chunk: {
          id: `chunk${i}`,
          fileId: 'file1',
          text: 'Very long content that would exceed token limits when combined with other chunks and the question.',
          chunkIndex: i,
          metadata: {
            fileName: 'large-file.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: new Date('2024-01-01'),
          },
        },
        similarity: 0.8,
        score: 0.8,
      }));

      mockRetriever.retrieve.mockResolvedValue(mockSearchResults);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
        maxTokens: 1000, // Very low limit to trigger safety check
      };

      const result = await orchestrator.processQuery(query);

      expect(result).toEqual({
        answer: "I found relevant content, but the query is too complex to process safely. Please try rephrasing your question to be more specific.",
        confidence: 0.0,
        sources: [],
        reasoning: expect.stringContaining('Query too large:'),
        totalChunksSearched: 100,
        tokensUsed: expect.any(Number),
      });

      expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
    });

    it('should handle OpenAI API errors gracefully', async () => {
      const mockSearchResults = [
        {
          chunk: {
            id: 'chunk1',
            fileId: 'file1',
            text: 'Test content',
            chunkIndex: 0,
            metadata: {
              fileName: 'test.pdf',
              fileType: 'application/pdf',
              owner: 'user@example.com',
              createdAt: new Date('2024-01-01'),
            },
          },
          similarity: 0.9,
          score: 0.9,
        },
      ];

      mockRetriever.retrieve.mockResolvedValue(mockSearchResults);
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('OpenAI API error'));

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
      };

      await expect(orchestrator.processQuery(query)).rejects.toThrow('RAG processing failed: Failed to generate answer: OpenAI API error');
    });

    it('should respect maxResults limit', async () => {
      const mockSearchResults = Array(10).fill(null).map((_, i) => ({
        chunk: {
          id: `chunk${i}`,
          fileId: 'file1',
          text: `Content ${i}`,
          chunkIndex: i,
          metadata: {
            fileName: 'test.pdf',
            fileType: 'application/pdf',
            owner: 'user@example.com',
            createdAt: new Date('2024-01-01'),
          },
        },
        similarity: 0.9,
        score: 0.9,
      }));

      const mockOpenAIResponse = {
        choices: [
          {
            message: {
              content: 'Test answer',
            },
          },
        ],
        usage: {
          total_tokens: 50,
        },
      };

      mockRetriever.retrieve.mockResolvedValue(mockSearchResults);
      mockOpenAI.chat.completions.create.mockResolvedValue(mockOpenAIResponse);

      const query: RAGQuery = {
        question: 'What is this about?',
        userId: 'user1',
        maxResults: 3,
      };

      await orchestrator.processQuery(query);

      // Should use all results (maxResults is handled by retriever, not orchestrator)
      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0]?.[0];
      const userMessage = callArgs?.messages.find((m: { role: string }) => m.role === 'user');
      expect(userMessage?.content).toContain('Content 0');
      expect(userMessage?.content).toContain('Content 1');
      expect(userMessage?.content).toContain('Content 2');
      expect(userMessage?.content).toContain('Content 3');
    });
  });

  describe('isReady', () => {
    it('should check if user has indexed content', async () => {
      mockRetriever.hasIndexedContent.mockResolvedValue(true);
      
      const result = await orchestrator.isReady('user1');
      
      expect(mockRetriever.hasIndexedContent).toHaveBeenCalledWith('user1');
      expect(result).toBe(true);
    });
  });

  describe('getStats', () => {
    it('should return user statistics', async () => {
      const mockStats = {
        indexedChunks: 100,
        totalChunks: 150,
        lastIndexed: new Date('2024-01-01'),
      };
      
      mockRetriever.getRetrievalStats.mockResolvedValue(mockStats);
      
      const result = await orchestrator.getStats('user1');
      
      expect(mockRetriever.getRetrievalStats).toHaveBeenCalledWith('user1');
      expect(result).toEqual(mockStats);
    });
  });

  describe('constructor', () => {
    it('should throw error when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => new RAGOrchestratorImpl()).toThrow('OPENAI_API_KEY environment variable is required');
    });
  });
});
