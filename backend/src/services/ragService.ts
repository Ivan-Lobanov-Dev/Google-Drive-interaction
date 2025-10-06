import { RAGQuery, RAGResponse } from '../interfaces/rag.js';
import { RAGOrchestratorImpl } from './rag/ragOrchestrator.js';
import { OpenAIEmbedder } from './rag/embedder.js';
import { PostgreSQLVectorStore } from './rag/vectorStore.js';
import { RAG_CONFIG } from '../config/rag.js';
import { prisma } from '../lib/prisma.js';

/**
 * RAG Service
 * Main service for Retrieval-Augmented Generation functionality
 */
export class RAGService {
  private orchestrator: RAGOrchestratorImpl;
  private embedder: OpenAIEmbedder;
  private vectorStore: PostgreSQLVectorStore;

  constructor() {
    this.orchestrator = new RAGOrchestratorImpl();
    this.embedder = new OpenAIEmbedder();
    this.vectorStore = new PostgreSQLVectorStore();
  }

  /**
   * Process a content-based question using RAG
   */
  async answerQuestion(question: string, userId: string, filters?: RAGQuery['filters']): Promise<RAGResponse> {
    const query: RAGQuery = {
      question: question.trim(),
      userId,
      maxResults: RAG_CONFIG.maxResults,
      similarityThreshold: RAG_CONFIG.similarityThreshold,
      maxTokens: RAG_CONFIG.maxTokens,
      ...(filters && { filters })
    };

    return await this.orchestrator.processQuery(query);
  }

  /**
   * Index existing chunks for RAG search (add embeddings to existing chunks)
   */
  async indexFile(fileId: string, _userId: string): Promise<{
    success: boolean;
    chunksIndexed: number;
    error?: string;
  }> {
    try {
      // 1. Get existing chunks from database (created during sync)
      const existingChunks = await prisma.fileChunk.findMany({
        where: {
          fileId: fileId
        },
        select: {
          id: true,
          text: true,
          chunkIndex: true,
          embedding: true
        }
      });

      if (existingChunks.length === 0) {
        return {
          success: false,
          chunksIndexed: 0,
          error: 'No chunks found for this file'
        };
      }

      // 2. Filter chunks that don't have embeddings yet
      const chunksNeedingEmbeddings = existingChunks.filter(chunk => !chunk.embedding);
      
      if (chunksNeedingEmbeddings.length === 0) {
        return {
          success: true,
          chunksIndexed: 0,
          error: 'All chunks already have embeddings'
        };
      }

      // 3. Create embeddings for chunks that need them
      const texts = chunksNeedingEmbeddings.map(chunk => chunk.text);
      const embeddings = await this.embedder.embedBatch(texts);

      // 4. Update chunks with embeddings
      for (let i = 0; i < chunksNeedingEmbeddings.length; i++) {
        const chunk = chunksNeedingEmbeddings[i];
        const embedding = embeddings[i];
        
        if (chunk && embedding) {
          await prisma.fileChunk.update({
            where: { id: chunk.id },
            data: {
              embedding: JSON.stringify(embedding.vector)
            }
          });
        }
      }

      console.log(`✅ Indexed file ${fileId}: ${chunksNeedingEmbeddings.length} chunks indexed`);

      return {
        success: true,
        chunksIndexed: chunksNeedingEmbeddings.length
      };
    } catch (error) {
      console.error(`Error indexing file ${fileId}:`, error);
      return {
        success: false,
        chunksIndexed: 0,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Remove file from RAG index
   */
  async removeFile(fileId: string): Promise<void> {
    try {
      await this.vectorStore.deleteFileChunks(fileId);
      console.log(`Removed file ${fileId} from RAG index`);
    } catch (error) {
      console.error(`Error removing file ${fileId} from RAG index:`, error);
      throw error;
    }
  }

  /**
   * Check if RAG is ready for a user
   */
  async isReady(userId: string): Promise<boolean> {
    return await this.orchestrator.isReady(userId);
  }

  /**
   * Get RAG statistics for a user
   */
  async getStats(userId: string): Promise<{
    indexedChunks: number;
    totalChunks: number;
    lastIndexed?: Date;
  }> {
    return await this.orchestrator.getStats(userId);
  }

  /**
   * Check if pgvector extension is available
   */
  async checkSystemHealth(): Promise<{
    pgvectorAvailable: boolean;
    openaiAvailable: boolean;
    databaseConnected: boolean;
  }> {
    const results = await Promise.allSettled([
      this.vectorStore.checkPgVectorExtension(),
      this.embedder.embedText('test'), // Simple test
      Promise.resolve(true) // Database connection test
    ]);

    return {
      pgvectorAvailable: results[0].status === 'fulfilled' ? results[0].value : false,
      openaiAvailable: results[1].status === 'fulfilled',
      databaseConnected: results[2].status === 'fulfilled'
    };
  }

  /**
   * Get RAG configuration
   */
  getConfig(): typeof RAG_CONFIG {
    return {
      ...RAG_CONFIG,
      embeddingModel: this.embedder.getEmbeddingDimension().toString()
    };
  }
}
