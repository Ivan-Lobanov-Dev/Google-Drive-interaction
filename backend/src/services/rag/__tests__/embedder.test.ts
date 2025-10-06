import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { OpenAIEmbedder } from '../embedder.js';

// Mock OpenAI
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    embeddings: {
      create: vi.fn(),
    },
  })),
}));

describe('OpenAIEmbedder', () => {
  let embedder: OpenAIEmbedder;
  let mockOpenAI: {
    embeddings: {
      create: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup environment
    process.env.OPENAI_API_KEY = 'test-api-key';
    
    // Setup mocks
    mockOpenAI = {
      embeddings: {
        create: vi.fn(),
      },
    };

    embedder = new OpenAIEmbedder();
    // Replace the OpenAI instance with our mock
    (embedder as unknown as { openai: typeof mockOpenAI }).openai = mockOpenAI;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.OPENAI_API_KEY;
  });

  describe('embedText', () => {
    it('should embed single text successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3, 0.4, 0.5],
            index: 0,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 5,
          total_tokens: 5,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embedder.embedText('Hello world');

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: 'Hello world',
        encoding_format: 'float',
      });

      expect(result).toEqual({
        vector: [0.1, 0.2, 0.3, 0.4, 0.5],
        dimension: 5,
        model: 'text-embedding-3-small',
      });
    });

    it('should handle empty text', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.0, 0.0, 0.0, 0.0, 0.0],
            index: 0,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 1,
          total_tokens: 1,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embedder.embedText('');

      expect(result).toEqual({
        vector: [0.0, 0.0, 0.0, 0.0, 0.0],
        dimension: 5,
        model: 'text-embedding-3-small',
      });
    });

    it('should handle OpenAI API errors', async () => {
      const error = new Error('OpenAI API error');
      mockOpenAI.embeddings.create.mockRejectedValue(error);

      await expect(embedder.embedText('Hello world')).rejects.toThrow('OpenAI API error');
    });

    it('should handle malformed response', async () => {
      const mockResponse = {
        data: [],
        model: 'text-embedding-ada-002',
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      await expect(embedder.embedText('Hello world')).rejects.toThrow('Failed to create embedding');
    });
  });

  describe('embedBatch', () => {
    it('should embed multiple texts successfully', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
          {
            embedding: [0.4, 0.5, 0.6],
            index: 1,
          },
          {
            embedding: [0.7, 0.8, 0.9],
            index: 2,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 15,
          total_tokens: 15,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const texts = ['Hello', 'World', 'Test'];
      const result = await embedder.embedBatch(texts);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: texts,
        encoding_format: 'float',
      });

      expect(result).toEqual([
        {
          vector: [0.1, 0.2, 0.3],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
        {
          vector: [0.4, 0.5, 0.6],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
        {
          vector: [0.7, 0.8, 0.9],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
      ]);
    });

    it('should handle empty batch', async () => {
      const result = await embedder.embedBatch([]);
      expect(result).toEqual([]);
      expect(mockOpenAI.embeddings.create).not.toHaveBeenCalled();
    });

    it('should handle single text in batch', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 5,
          total_tokens: 5,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embedder.embedBatch(['Hello']);

      expect(result).toEqual([
        {
          vector: [0.1, 0.2, 0.3],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
      ]);
    });

    it('should handle batch with mixed results', async () => {
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
          {
            embedding: [0.4, 0.5, 0.6],
            index: 1,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const texts = ['Hello', 'World', 'Test']; // 3 texts but only 2 embeddings
      const result = await embedder.embedBatch(texts);

      // Should return only the embeddings that were received
      expect(result).toEqual([
        {
          vector: [0.1, 0.2, 0.3],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
        {
          vector: [0.4, 0.5, 0.6],
          dimension: 3,
          model: 'text-embedding-3-small',
        },
      ]);
    });

    it('should handle API errors in batch', async () => {
      const error = new Error('Rate limit exceeded');
      mockOpenAI.embeddings.create.mockRejectedValue(error);

      await expect(embedder.embedBatch(['Hello', 'World'])).rejects.toThrow('Rate limit exceeded');
    });
  });

  describe('getEmbeddingDimension', () => {
    it('should return correct embedding dimension', () => {
      const dimension = embedder.getEmbeddingDimension();
      expect(dimension).toBe(1536); // text-embedding-ada-002 dimension
    });
  });

  describe('constructor', () => {
    it('should throw error when OPENAI_API_KEY is not set', () => {
      delete process.env.OPENAI_API_KEY;
      
      expect(() => new OpenAIEmbedder()).toThrow('OPENAI_API_KEY environment variable is required');
    });

    it('should initialize with correct model', () => {
      process.env.OPENAI_API_KEY = 'test-key';
      
      const embedder = new OpenAIEmbedder();
      // The model is not stored as a property, it's used from RAG_CONFIG
      expect(embedder).toBeDefined();
    });
  });

  describe('text preprocessing', () => {
    it('should handle long texts', async () => {
      const longText = 'A'.repeat(10000); // Very long text
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 1000,
          total_tokens: 1000,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embedder.embedText(longText);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: expect.any(String), // Text may be cleaned/truncated
        encoding_format: 'float',
      });

      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    });

    it('should handle special characters', async () => {
      const specialText = 'Hello 世界! 🌍 @#$%^&*()';
      const mockResponse = {
        data: [
          {
            embedding: [0.1, 0.2, 0.3],
            index: 0,
          },
        ],
        model: 'text-embedding-ada-002',
        usage: {
          prompt_tokens: 10,
          total_tokens: 10,
        },
      };

      mockOpenAI.embeddings.create.mockResolvedValue(mockResponse);

      const result = await embedder.embedText(specialText);

      expect(mockOpenAI.embeddings.create).toHaveBeenCalledWith({
        model: 'text-embedding-3-small',
        input: specialText,
        encoding_format: 'float',
      });

      expect(result.vector).toEqual([0.1, 0.2, 0.3]);
    });
  });
});
