/**
 * AI Routes - Google Drive AI Integration
 * 
 * ENDPOINTS:
 * - POST /api/ai/rag/ingest-plan: Returns plan for content ingestion and vector indexing
 * - POST /api/ai/rag/query: Universal endpoint supporting both metadata and content search
 * 
 * The system automatically detects question type:
 * - Metadata questions → uses existing AI service
 * - Content questions → uses RAG system with vector embeddings
 */

import express, { Request, Response } from 'express';
import { authenticate } from '../middleware/auth.js';
import { AIService } from '../services/aiService.js';
import { RAGService } from '../services/ragService.js';
import { QuestionContext } from '../interfaces/aiProvider.js';
import { RAGQuery } from '../interfaces/rag.js';
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
// All metadata questions should search across ALL files, not just user's files
function needsAllFiles(question: string): boolean {
  const metadataKeywords = [
    // Ownership questions
    'who owns',
    'who has',
    'which user',
    'which owner',
    'most files',
    'largest owner',
    'total files',
    'all files',
    'everyone',
    'all users',
    'average number of files per owner',
    'files per owner',
    
    // File analysis questions
    'which file was modified most recently',
    'most recently modified',
    'latest file',
    'newest file',
    'which file is the largest',
    'largest file',
    'biggest file',
    'file size',
    'largest files',
    'modified most recently',
    'recently modified',
    'is the largest',
    'biggest',
    
    // Distribution questions
    'distribution of files',
    'file distribution',
    'by their last modified date',
    'by modified date',
    'by date',
    'file types',
    'type distribution',
    
    // Statistical questions
    'how many files',
    'total number',
    'count of files',
    'file count',
    'statistics',
    'overview'
  ];
  
  const lowerQuestion = question.toLowerCase();
  return metadataKeywords.some(keyword => lowerQuestion.includes(keyword));
}

/**
 * Determine if a question is content-based (requires RAG) or metadata-based
 */
function isContentBasedQuestion(question: string): boolean {
  const trimmedQuestion = question.toLowerCase();
  
  // Keywords that indicate content-based questions
  const contentKeywords = [
    'what does', 'what is', 'what are', 'what contains', 'what mentions',
    'what says', 'what discusses', 'what explains', 'what describes',
    'content', 'text', 'document', 'report', 'contains', 'mentions',
    'discusses', 'explains', 'describes', 'says', 'written', 'about',
    'summary', 'main points', 'key points', 'details', 'information',
    'find', 'search', 'look for', 'where is', 'show me'
  ];
  
  // Keywords that indicate metadata questions
  const metadataKeywords = [
    'who owns', 'owner', 'ownership', 'most files', 'largest', 'smallest',
    'average', 'total', 'distribution', 'count', 'how many', 'statistics',
    'modified', 'created', 'date', 'time', 'recently', 'oldest', 'newest',
    'file type', 'mime type', 'extension', 'format', 'size', 'biggest',
    'smallest', 'empty', 'zero', 'largest file', 'smallest file',
    'file analysis', 'file distribution', 'file statistics', 'file summary'
  ];
  
  const hasContentKeywords = contentKeywords.some(keyword => trimmedQuestion.includes(keyword));
  const hasMetadataKeywords = metadataKeywords.some(keyword => trimmedQuestion.includes(keyword));
  
  // If it has content keywords but no metadata keywords, it's content-based
  // If it has metadata keywords, it's metadata-based
  // Default to metadata-based for ambiguous questions
  return hasContentKeywords && !hasMetadataKeywords;
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
  // Metadata questions (statistics, ownership, file analysis) → ALL files
  // Content questions (future RAG implementation) → USER files only
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
 * CURRENT STATUS: ✅ IMPLEMENTED - Returns plan for indexing files with embeddings
 */
router.post('/rag/ingest-plan', async (req: Request & { user?: AuthenticatedUser }, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { fileIds, dateRange, owner, fileType } = req.body;
    const userId = req.user.id;

    // Get files that need indexing
    const whereClause: {
      userId: string;
      id?: { in: string[] };
      createdAt?: { gte?: Date; lte?: Date };
      owner?: string;
      mimeType?: { contains: string };
    } = {
      userId: userId
    };

    if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
      whereClause.id = { in: fileIds };
    }

    if (dateRange?.from || dateRange?.to) {
      whereClause.createdAt = {};
      if (dateRange.from) whereClause.createdAt.gte = new Date(dateRange.from);
      if (dateRange.to) whereClause.createdAt.lte = new Date(dateRange.to);
    }

    if (owner) {
      whereClause.owner = owner;
    }

    if (fileType) {
      whereClause.mimeType = { contains: fileType };
    }

    const files = await prisma.filesMetadata.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        createdAt: true
      }
    });

    // Check which files have chunks that need embeddings
    const filesWithChunks = await prisma.fileChunk.groupBy({
      by: ['fileId'],
      where: {
        fileId: { in: files.map(f => f.id) }
      },
      _count: {
        id: true
      }
    });

    const filesNeedingIndexing = files.filter(file => {
      const chunkCount = filesWithChunks.find(f => f.fileId === file.id)?._count.id || 0;
      return chunkCount > 0;
    });

    const ingestionPlan = {
      strategy: 'embedding_creation',
      totalFiles: files.length,
      filesNeedingIndexing: filesNeedingIndexing.length,
      estimatedChunks: filesWithChunks.reduce((sum, f) => sum + f._count.id, 0),
      files: filesNeedingIndexing.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: file.size,
        createdAt: file.createdAt,
        needsIndexing: true
      })),
      filters: {
        fileIds: fileIds || null,
        dateRange: dateRange || null,
        owner: owner || null,
        fileType: fileType || null
      }
    };

    return res.json(ingestionPlan);

  } catch (error) {
    console.error('RAG ingest plan error:', error);
    return res.status(500).json({
      error: 'Failed to create ingestion plan',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /rag/query
 * Universal endpoint for AI-powered question answering
 * 
 * CURRENT IMPLEMENTATION: 
 * - ✅ Metadata-only analysis (existing functionality)
 * - ✅ Content-based RAG search (new functionality)
 * 
 * The endpoint automatically detects question type:
 * - Metadata questions (file stats, ownership, etc.) → uses existing AI service
 * - Content questions (search in document text) → uses RAG system
 */
router.post('/rag/query', async (req: Request & { user?: { id: string; email?: string } }, res: Response): Promise<Response> => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { question, filters, dateRange, owner, fileType } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        error: 'Question is required and must be a non-empty string'
      });
    }

    const trimmedQuestion = question.trim();
    
    // Determine if this is a content-based question or metadata question
    const isContentQuestion = isContentBasedQuestion(trimmedQuestion);
    
    if (isContentQuestion) {
      // Use RAG service for content-based questions
      const ragService = new RAGService();
      
      // Check if user has any indexed content
      const isReady = await ragService.isReady(req.user.id);
      if (!isReady) {
        return res.status(200).json({
          question: trimmedQuestion,
          answer: "No content has been indexed for search yet. Please sync your files first to enable content-based search.",
          confidence: 0.0,
          sources: [],
          reasoning: "No indexed content available",
          type: 'no_content',
          totalChunksSearched: 0,
          filters: { dateRange, owner, fileType },
          timestamp: new Date().toISOString()
        });
      }

      // Build filters for RAG query
      const ragFilters: RAGQuery['filters'] = {};
      if (dateRange?.from || dateRange?.to) {
        ragFilters.dateRange = {};
        if (dateRange.from) {
          ragFilters.dateRange.from = new Date(dateRange.from);
        }
        if (dateRange.to) {
          ragFilters.dateRange.to = new Date(dateRange.to);
        }
      }
      if (owner) ragFilters.owner = owner;
      if (fileType) ragFilters.fileType = fileType;

      const response = await ragService.answerQuestion(trimmedQuestion, req.user.id, ragFilters);

      return res.json({
        question: trimmedQuestion,
        answer: response.answer,
        confidence: response.confidence,
        sources: response.sources,
        reasoning: response.reasoning,
        type: 'content_search',
        totalChunksSearched: response.totalChunksSearched,
        tokensUsed: response.tokensUsed,
        filters: { dateRange, owner, fileType },
        timestamp: new Date().toISOString()
      });
    }

    // Use existing AI service for metadata questions
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

    // Transform files for statistics - limit based on question type to reduce token usage
    // Use the same needsAllFiles function that determines the database query
    const maxFiles = needsAllFiles(trimmedQuestion) ? files.length : Math.min(files.length, 50);
    
    
    const driveFiles = files.slice(0, maxFiles).map(file => ({
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
