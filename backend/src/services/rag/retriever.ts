import { RAGQuery, SearchResult, Retriever } from '../../interfaces/rag.js';
import { OpenAIEmbedder } from './embedder.js';
import { PostgreSQLVectorStore } from './vectorStore.js';
import { RAG_CONFIG } from '../../config/rag.js';
import { prisma } from '../../lib/prisma.js';

/**
 * RAG Retriever
 * Finds relevant chunks for a given query using vector similarity search
 */
export class RAGRetriever implements Retriever {
  private embedder: OpenAIEmbedder;
  private vectorStore: PostgreSQLVectorStore;

  constructor() {
    this.embedder = new OpenAIEmbedder();
    this.vectorStore = new PostgreSQLVectorStore();
  }

  /**
   * Retrieve relevant chunks for a query
   */
  async retrieve(query: RAGQuery): Promise<SearchResult[]> {
    try {
      // 1. Create embedding for the query
      const queryEmbedding = await this.embedder.embedText(query.question);
      
      // 2. Search for similar chunks
      const searchResults = await this.vectorStore.searchSimilar(
        queryEmbedding.vector,
        query.userId,
        query.maxResults || RAG_CONFIG.maxResults,
        query.similarityThreshold || RAG_CONFIG.similarityThreshold,
        query.filters
      );

      // 3. Enrich results with file metadata
      const enrichedResults = await this.enrichResultsWithMetadata(searchResults);


      return enrichedResults;
    } catch (error) {
      console.error('Error in RAG retrieval:', error);
      throw new Error(`RAG retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enrich search results with file metadata
   */
  private async enrichResultsWithMetadata(results: SearchResult[]): Promise<SearchResult[]> {
    if (results.length === 0) return results;

    try {
      // Get file IDs from results
      const fileIds = [...new Set(results.map(result => result.chunk.fileId))];
      
      // Fetch file metadata
      const files = await prisma.filesMetadata.findMany({
        where: {
          id: {
            in: fileIds
          }
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          owner: true
        }
      });

      // Create file lookup map
      const fileMap = new Map(files.map(file => [file.id, file]));

      // Enrich results with metadata
      const enrichedResults = results.map(result => {
        const file = fileMap.get(result.chunk.fileId);
        
        return {
          ...result,
          chunk: {
            ...result.chunk,
            metadata: {
              fileName: file?.name || 'Unknown',
              fileType: file?.mimeType || 'unknown',
              owner: file?.owner || 'unknown',
              createdAt: result.chunk.metadata?.createdAt || new Date()
            }
          }
        };
      });

      return enrichedResults;
    } catch (error) {
      console.error('Error enriching results with metadata:', error);
      // Return original results if enrichment fails
      return results;
    }
  }

  /**
   * Check if user has any indexed content
   */
  async hasIndexedContent(userId: string): Promise<boolean> {
    try {
      const count = await prisma.fileChunk.count({
        where: {
          file: {
            userId: userId
          },
          embedding: {
            not: null
          }
        }
      });

      return count > 0;
    } catch (error) {
      console.error('Error checking indexed content:', error);
      return false;
    }
  }

  /**
   * Get retrieval statistics for a user
   */
  async getRetrievalStats(userId: string): Promise<{
    totalChunks: number;
    indexedChunks: number;
    lastIndexed?: Date;
  }> {
    try {
      const [totalChunks, indexedChunks, lastChunk] = await Promise.all([
        prisma.fileChunk.count({
          where: {
            file: {
              userId: userId
            }
          }
        }),
        prisma.fileChunk.count({
          where: {
            file: {
              userId: userId
            },
            embedding: {
              not: null
            }
          }
        }),
        prisma.fileChunk.findFirst({
          where: {
            file: {
              userId: userId
            },
            embedding: {
              not: null
            }
          },
          orderBy: {
            createdAt: 'desc'
          },
          select: {
            createdAt: true
          }
        })
      ]);

      return {
        totalChunks,
        indexedChunks,
        ...(lastChunk?.createdAt && { lastIndexed: lastChunk.createdAt })
      };
    } catch (error) {
      console.error('Error getting retrieval stats:', error);
      return {
        totalChunks: 0,
        indexedChunks: 0
      };
    }
  }
}
