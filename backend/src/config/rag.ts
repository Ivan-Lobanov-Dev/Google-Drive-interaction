import { RAGConfig } from '../interfaces/rag.js';

/**
 * RAG Configuration
 * Safety limits to prevent token overflow and excessive costs
 */
export const RAG_CONFIG: RAGConfig = {
  // Safety limits
  maxTokens: 5000, // Maximum tokens to send to OpenAI API
  maxResults: 10,  // Maximum chunks to retrieve for context
  
  // Search configuration
  similarityThreshold: 0.7, // Minimum similarity score (0-1)
  
  // Embedding configuration
  embeddingModel: 'text-embedding-3-small', // OpenAI embedding model
  chunkSize: 800, // Characters per chunk
  chunkOverlap: 50, // Overlap between chunks
};

/**
 * Token estimation utilities
 */
export class TokenEstimator {
  // Rough estimation: 1 token ≈ 4 characters for English text
  private static readonly CHARS_PER_TOKEN = 4;
  
  /**
   * Estimate tokens for text
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / this.CHARS_PER_TOKEN);
  }
  
  /**
   * Estimate tokens for RAG context
   */
  static estimateRAGTokens(question: string, chunks: Array<{ text: string }>): number {
    let totalTokens = this.estimateTokens(question);
    
    // Add system prompt tokens (rough estimate)
    totalTokens += 100;
    
    // Add chunk tokens
    for (const chunk of chunks) {
      totalTokens += this.estimateTokens(chunk.text);
      totalTokens += 50; // Overhead for chunk formatting
    }
    
    return totalTokens;
  }
  
  /**
   * Check if query is safe to process
   */
  static isSafeToProcess(question: string, chunks: Array<{ text: string }>): boolean {
    const estimatedTokens = this.estimateRAGTokens(question, chunks);
    return estimatedTokens <= RAG_CONFIG.maxTokens;
  }
}
