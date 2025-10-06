import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../../index.js';

// Set up environment variables for tests
process.env.OPENAI_API_KEY = 'test-api-key';

// Mock OpenAI adapter
vi.mock('../../adapters/openaiAdapter.js', () => ({
  OpenAIAdapter: vi.fn().mockImplementation(() => ({
    answerQuestion: vi.fn().mockResolvedValue({
      answer: 'Test answer',
      confidence: 0.9,
      sources: ['file1.pdf'],
      reasoning: 'Test reasoning'
    }),
    getFileStatistics: vi.fn().mockResolvedValue({
      totalFiles: 5,
      totalSize: 1024000,
      averageSize: 204800,
      fileTypes: { 'application/pdf': 3, 'text/plain': 2 },
      owners: { 'user@example.com': 5 },
      recentFiles: [],
      largestFiles: []
    })
  }))
}));

// Mock AI Service
vi.mock('../../services/aiService.js', () => {
  const mockAIService = {
    answerQuestion: vi.fn().mockResolvedValue({
      answer: 'Test answer',
      confidence: 0.9,
      sources: ['file1.pdf'],
      reasoning: 'Test reasoning'
    }),
    getFileStatistics: vi.fn().mockResolvedValue({
      totalFiles: 5,
      totalSize: 1024000,
      averageSize: 204800,
      fileTypes: { 'application/pdf': 3, 'text/plain': 2 },
      owners: { 'user@example.com': 5 },
      recentFiles: [],
      largestFiles: []
    })
  };

  return {
    AIService: vi.fn().mockImplementation(() => mockAIService)
  };
});

// Mock Prisma
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    filesMetadata: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    }
  }
}));

// Mock authentication middleware
vi.mock('../../middleware/auth.js', () => ({
  authenticate: vi.fn((req: { user?: { id: string; email: string }; session?: { accessToken: string } }, res: unknown, next: () => void) => {
    req.user = { id: 'test-user-id', email: 'user@example.com' };
    req.session = { accessToken: 'test-token' };
    next();
  })
}));

describe('AI Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    
    const { prisma } = await import('../../lib/prisma.js');
    (prisma.filesMetadata.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 'file1',
        name: 'test.pdf',
        mimeType: 'application/pdf',
        size: 1024000,
        modifiedTime: new Date('2024-01-01'),
        createdTime: new Date('2024-01-01'),
        owner: 'user@example.com',
        extraMetadata: {},
        chunks: [
          { id: 'chunk1', text: 'Test content', chunkIndex: 0 }
        ]
      }
    ]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });


  describe('POST /api/ai/rag/query', () => {
    it.skip('should handle metadata questions', async () => {
      const response = await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'Who owns the most files?'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'metadata');
      expect(response.body).toHaveProperty('answer');
      expect(response.body).toHaveProperty('statistics');
    });

    it.skip('should handle content questions as metadata-only', async () => {
      const response = await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'What documents mention project planning?'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('type', 'metadata');
      expect(response.body).toHaveProperty('answer');
      expect(response.body).toHaveProperty('statistics');
    });

    it('should return 400 for empty question', async () => {
      await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: ''
        })
        .expect(400);
    });

    it('should return 401 if not authenticated', async () => {
      const { authenticate } = await import('../../middleware/auth.js');
      (authenticate as ReturnType<typeof vi.fn>).mockImplementationOnce((req: { user?: { id: string; email: string } | undefined; session?: { accessToken: string } }, res: unknown, next: () => void) => {
        req.user = undefined;
        next();
      });

      await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'Test question'
        })
        .expect(401);
    });

    it.skip('should handle filters correctly', async () => {
      // Ensure we have the right mock data for this test
      const { prisma } = await import('../../lib/prisma.js');
      (prisma.filesMetadata.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 'file1',
          name: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          modifiedTime: new Date('2024-01-01'),
          createdTime: new Date('2024-01-01'),
          owner: 'user@example.com',
          extraMetadata: {},
          chunks: [
            { id: 'chunk1', text: 'Test content', chunkIndex: 0 }
          ]
        }
      ]);

      const response = await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'Who owns the most files?',
          filters: {
            dateRange: {
              start: '2024-01-01',
              end: '2024-12-31'
            },
            fileTypes: ['application/pdf']
          }
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('filters');
      expect(response.body.filters.fileTypes).toEqual(['application/pdf']);
    });

    it('should return appropriate message when no files found', async () => {
      const { prisma } = await import('../../lib/prisma.js');
      (prisma.filesMetadata.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

      const response = await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'Who owns the most files?'
        })
        .expect(200);

      expect(response.body.answer).toContain('No files found');
      expect(response.body.type).toBe('empty');
    });

    it.skip('should handle content questions with no chunks', async () => {
      const { prisma } = await import('../../lib/prisma.js');
      (prisma.filesMetadata.findMany as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: 'file1',
          name: 'test.pdf',
          mimeType: 'application/pdf',
          size: 1024000,
          modifiedTime: new Date('2024-01-01'),
          createdTime: new Date('2024-01-01'),
          owner: 'user@example.com',
          extraMetadata: {},
          chunks: []
        }
      ]);

      const response = await request(app)
        .post('/api/ai/rag/query')
        .send({
          question: 'What documents mention project planning?'
        });

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('metadata');
      expect(response.body).toHaveProperty('statistics');
    });
  });
});
