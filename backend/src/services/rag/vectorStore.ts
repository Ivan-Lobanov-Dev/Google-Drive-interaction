import { prisma } from '../../lib/prisma.js';
import { Chunk, SearchResult, VectorStore } from '../../interfaces/rag.js';
import { RAG_CONFIG } from '../../config/rag.js';

/**
 * PostgreSQL Vector Store using pgvector
 * Stores and searches vector embeddings in the database
 */
export class PostgreSQLVectorStore implements VectorStore {
  
  /**
   * Store chunks with embeddings in the database
   */
  async storeChunks(chunks: Chunk[]): Promise<void> {
    if (chunks.length === 0) return;

    try {
      // Prepare data for batch insert
      const chunkData = chunks.map(chunk => ({
        id: chunk.id,
        fileId: chunk.fileId,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        embedding: chunk.embedding ? JSON.stringify(chunk.embedding) : null,
        userId: chunk.metadata?.owner || '', // Store userId for filtering
        createdAt: chunk.metadata?.createdAt || new Date()
      }));

      // Delete existing chunks for these files first
      const fileIds = [...new Set(chunks.map(chunk => chunk.fileId))];
      await prisma.fileChunk.deleteMany({
        where: {
          fileId: {
            in: fileIds
          }
        }
      });

      // Insert new chunks
      await prisma.fileChunk.createMany({
        data: chunkData
      });

    } catch (error) {
      console.error('Error storing chunks in vector store:', error);
      throw new Error(`Failed to store chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search for similar chunks using vector similarity
   */
  async searchSimilar(
    queryEmbedding: number[], 
    userId: string, 
    limit: number = RAG_CONFIG.maxResults,
    threshold: number = RAG_CONFIG.similarityThreshold,
    filters?: {
      dateRange?: {
        from?: Date;
        to?: Date;
      };
      owner?: string;
      fileType?: string;
    }
  ): Promise<SearchResult[]> {
    try {
      const embeddingString = JSON.stringify(queryEmbedding);
      
      // Build WHERE conditions for filters
      let whereConditions = `fm.userId = '${userId}' AND fc.embedding IS NOT NULL`;
      
      if (filters?.dateRange?.from) {
        whereConditions += ` AND fm.createdAt >= '${filters.dateRange.from.toISOString()}'`;
      }
      if (filters?.dateRange?.to) {
        whereConditions += ` AND fm.createdAt <= '${filters.dateRange.to.toISOString()}'`;
      }
      if (filters?.owner) {
        whereConditions += ` AND fm.owner = '${filters.owner}'`;
      }
      if (filters?.fileType) {
        whereConditions += ` AND fm.mimeType LIKE '%${filters.fileType}%'`;
      }
      
      // Use pgvector similarity search with cosine distance
      const results = await prisma.$queryRaw<Array<{
        id: string;
        fileId: string;
        text: string;
        chunkIndex: number;
        embedding: string;
        similarity: number;
      }>>`
        SELECT 
          fc.id,
          fc.fileId,
          fc.text,
          fc.chunkIndex,
          fc.embedding,
          1 - (fc.embedding <=> ${embeddingString}::vector) as similarity
        FROM file_chunks fc
        JOIN files_metadata fm ON fc.fileId = fm.id
        WHERE ${whereConditions}
          AND (1 - (fc.embedding <=> ${embeddingString}::vector)) > ${threshold}
        ORDER BY fc.embedding <=> ${embeddingString}::vector
        LIMIT ${limit}
      `;

      // Convert to SearchResult format
      const searchResults: SearchResult[] = results.map(result => {
        let embedding: number[] = [];
        try {
          embedding = JSON.parse(result.embedding);
        } catch {
          console.warn(`Failed to parse embedding for chunk ${result.id}`);
        }

        return {
          chunk: {
            id: result.id,
            fileId: result.fileId,
            text: result.text,
            chunkIndex: result.chunkIndex,
            embedding,
            metadata: {
              fileName: '', // Will be populated by caller if needed
              fileType: '',
              owner: userId,
              createdAt: new Date()
            }
          },
          similarity: result.similarity,
          score: result.similarity
        };
      });

      return searchResults;
    } catch (error) {
      console.error('Error searching vector store:', error);
      throw new Error(`Failed to search vector store: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete chunks for a specific file
   */
  async deleteFileChunks(fileId: string): Promise<void> {
    try {
      await prisma.fileChunk.deleteMany({
        where: {
          fileId: fileId
        }
      });
      
    } catch (error) {
      console.error(`Error deleting chunks for file ${fileId}:`, error);
      throw new Error(`Failed to delete file chunks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get statistics about stored chunks
   */
  async getStats(userId?: string): Promise<{
    totalChunks: number;
    chunksWithEmbeddings: number;
    averageSimilarity: number;
  }> {
    try {
      const whereClause = userId ? { 
        file: { userId } 
      } : {};

      const [totalChunks, chunksWithEmbeddings] = await Promise.all([
        prisma.fileChunk.count({
          where: whereClause
        }),
        prisma.fileChunk.count({
          where: {
            ...whereClause,
            embedding: {
              not: null
            }
          }
        })
      ]);

      return {
        totalChunks,
        chunksWithEmbeddings,
        averageSimilarity: 0 // Would need to calculate from actual searches
      };
    } catch (error) {
      console.error('Error getting vector store stats:', error);
      return {
        totalChunks: 0,
        chunksWithEmbeddings: 0,
        averageSimilarity: 0
      };
    }
  }

  /**
   * Check if pgvector extension is available
   */
  async checkPgVectorExtension(): Promise<boolean> {
    try {
      const result = await prisma.$queryRaw<Array<{ extname: string }>>`
        SELECT extname FROM pg_extension WHERE extname = 'vector'
      `;
      
      return result.length > 0;
    } catch (error) {
      console.error('Error checking pgvector extension:', error);
      return false;
    }
  }
}
