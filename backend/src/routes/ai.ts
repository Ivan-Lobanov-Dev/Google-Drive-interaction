/**
 * AI Routes - Google Drive AI Integration
 * 
 * CURRENT IMPLEMENTATION STATUS:
 * - ✅ Metadata-only search: Analyzes file metadata (names, sizes, owners, dates)
 * - ❌ Content-based RAG: Not implemented (would require ingest-plan)
 * 
 * NOTE: The /rag/ingest-plan endpoint exists but is not actively used since we currently
 * only support metadata analysis. When content-based RAG is implemented in the future,
 * ingest-plan will be essential for:
 * - Planning content ingestion strategies
 * - Optimizing token usage through semantic search
 * - Managing vector embeddings for file content
 * - Batch processing large file collections
 * 
 * For now, all questions are answered using file metadata only, making ingest-plan unnecessary.
 */

import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AIService } from '../services/aiService.js';
import { QuestionContext } from '../interfaces/aiProvider.js';
import { prisma } from '../lib/prisma.js';

// Type for authenticated user
interface AuthenticatedUser {
  id: string;
  email?: string;
}

const router = express.Router();

// Apply authentication middleware to all AI routes
router.use(authenticate);


// Types for filters
interface DateRange {
  start?: string;
  end?: string;
}

interface QueryFilters {
  dateRange?: DateRange;
  fileTypes?: string[];
  owners?: string[];
}

// Helper function to determine if question needs all files (not just user's files)
function needsAllFiles(question: string): boolean {
  const allFilesKeywords = [
    'who owns the most',
    'who has the most',
    'which user has',
    'which owner has',
    'most files',
    'largest owner',
    'total files',
    'all files',
    'everyone',
    'all users'
  ];
  
  const lowerQuestion = question.toLowerCase();
  return allFilesKeywords.some(keyword => lowerQuestion.includes(keyword));
}

// Helper function to get filtered files
async function getFilteredFiles(userId: string, question: string, filters?: QueryFilters): Promise<Array<{
  id: string;
  name: string;
  mimeType: string;
  size: bigint | null;
  modifiedTime: Date;
  createdTime: Date;
  owner: string;
  extraMetadata: unknown;
  chunks: Array<{
    id: string;
    text: string;
    chunkIndex: number;
  }>;
}>> {
  const whereClause: Record<string, unknown> = {};
  
  // Only filter by userId if question doesn't need all files
  if (!needsAllFiles(question)) {
    whereClause.userId = userId;
  }

  if (filters) {
    if (filters.dateRange) {
      if (filters.dateRange.start) {
        whereClause.modifiedTime = { ...(whereClause.modifiedTime as Record<string, unknown> || {}), gte: new Date(filters.dateRange.start) };
      }
      if (filters.dateRange.end) {
        whereClause.modifiedTime = { ...(whereClause.modifiedTime as Record<string, unknown> || {}), lte: new Date(filters.dateRange.end) };
      }
    }

    if (filters.fileTypes && filters.fileTypes.length > 0) {
      whereClause.mimeType = { in: filters.fileTypes };
    }

    if (filters.owners && filters.owners.length > 0) {
      whereClause.owner = { in: filters.owners };
    }
  }

  return await prisma.filesMetadata.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      mimeType: true,
      size: true,
      modifiedTime: true,
      createdTime: true,
      owner: true,
      extraMetadata: true,
      chunks: {
        select: {
          id: true,
          text: true,
          chunkIndex: true
        },
        orderBy: { chunkIndex: 'asc' }
      }
    }
  });
}

/**
 * POST /rag/ingest-plan
 * Returns a plan for content ingestion and vector indexing
 * 
 * CURRENT STATUS: Not implemented yet
 * 
 * This endpoint will be implemented later when we add content-based RAG functionality.
 * It will be used for:
 * - Planning which files to process and index
 * - Creating vector embeddings from file content chunks
 * - Optimizing token usage and processing strategies
 * - Managing batch processing of large file collections
 * 
 * For now, we only support metadata-only analysis through /rag/query endpoint.
 */
router.post('/rag/ingest-plan', async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  return res.status(501).json({
    error: 'Not implemented yet',
    message: 'This endpoint will be implemented later for content-based RAG with vector search',
    currentCapability: 'Metadata-only analysis is available through /rag/query endpoint'
  });
});

/**
 * POST /rag/query
 * Universal endpoint for AI-powered question answering
 * 
 * CURRENT IMPLEMENTATION: Metadata-only analysis
 * - Analyzes file metadata (names, sizes, owners, dates, types)
 * - Provides statistical insights and answers
 * - Does NOT analyze file content (no text extraction from files)
 * 
 * FUTURE: Will support content-based RAG when implemented
 * - Will analyze actual file content using embeddings
 * - Will use ingest-plan for optimization
 * - Will perform semantic search across file contents
 */
router.post('/rag/query', async (req: Request & { user?: { id: string; email?: string } }, res: Response): Promise<Response> => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { question, filters } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        error: 'Question is required and must be a non-empty string'
      });
    }

    const trimmedQuestion = question.trim();
    const aiService = new AIService();

    // Get files based on filters and question type
    const files = await getFilteredFiles(req.user.id, trimmedQuestion, filters);

    if (files.length === 0) {
      return res.status(200).json({
        question: trimmedQuestion,
        answer: "No files found matching your criteria. Please adjust your filters or sync more files.",
        confidence: 1.0,
        sources: [],
        reasoning: "No files found with specified filters",
        type: 'empty',
        totalFiles: 0,
        filters: filters || {}
      });
    }

    // Transform files for statistics - limit to essential data to reduce token usage
    const driveFiles = files.slice(0, 50).map(file => ({
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: Number(file.size || 0),
      modifiedTime: file.modifiedTime.toISOString(),
      createdTime: file.createdTime.toISOString(),
      owner: file.owner || 'Unknown'
    }));

    // Create question context for AI analysis
    const questionContext: QuestionContext = {
      question: trimmedQuestion,
      files: driveFiles,
      userEmail: req.user.email || 'Unknown'
    };

    // Get AI response (includes statistics)
    const aiResponse = await aiService.answerQuestion(questionContext);

    return res.json({
      question: trimmedQuestion,
      answer: aiResponse.answer,
      confidence: aiResponse.confidence,
      sources: aiResponse.sources,
      reasoning: aiResponse.reasoning,
      type: 'metadata',
      statistics: aiResponse.statistics,
      totalFiles: files.length,
      filters: filters || {},
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('RAG query error:', error);
    return res.status(500).json({
      error: 'Failed to process RAG query',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});


export { router as aiRouter };
