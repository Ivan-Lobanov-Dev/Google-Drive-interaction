import OpenAI from 'openai';
import { Embedding, Embedder } from '../../interfaces/rag.js';
import { RAG_CONFIG } from '../../config/rag.js';

/**
 * OpenAI Embedding Service
 * Converts text to vector embeddings for semantic search
 */
export class OpenAIEmbedder implements Embedder {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required for embeddings');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Create embedding for a single text
   */
  async embedText(text: string): Promise<Embedding> {
    try {
      // Clean and truncate text if too long
      const cleanText = this.cleanText(text);
      
      const response = await this.openai.embeddings.create({
        model: RAG_CONFIG.embeddingModel,
        input: cleanText,
        encoding_format: 'float'
      });

      const embedding = response.data[0];
      if (!embedding || !embedding.embedding) {
        throw new Error('No embedding returned from OpenAI');
      }

      return {
        vector: embedding.embedding,
        dimension: embedding.embedding.length,
        model: RAG_CONFIG.embeddingModel
      };
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw new Error(`Failed to create embedding: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create embeddings for multiple texts (batch processing)
   */
  async embedBatch(texts: string[]): Promise<Embedding[]> {
    try {
      // Clean all texts
      const cleanTexts = texts.map(text => this.cleanText(text));
      
      // Process in batches to avoid API limits
      const batchSize = 100; // OpenAI batch limit
      const embeddings: Embedding[] = [];

      for (let i = 0; i < cleanTexts.length; i += batchSize) {
        const batch = cleanTexts.slice(i, i + batchSize);
        
        const response = await this.openai.embeddings.create({
          model: RAG_CONFIG.embeddingModel,
          input: batch,
          encoding_format: 'float'
        });

        const batchEmbeddings = response.data.map(item => ({
          vector: item.embedding!,
          dimension: item.embedding!.length,
          model: RAG_CONFIG.embeddingModel
        }));

        embeddings.push(...batchEmbeddings);
      }

      return embeddings;
    } catch (error) {
      console.error('Error creating batch embeddings:', error);
      throw new Error(`Failed to create batch embeddings: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clean and prepare text for embedding
   */
  private cleanText(text: string): string {
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Truncate if too long (OpenAI has input limits)
    const maxLength = 8000; // Conservative limit for text-embedding-3-small
    if (cleaned.length > maxLength) {
      cleaned = cleaned.substring(0, maxLength);
      console.warn(`Text truncated to ${maxLength} characters for embedding`);
    }
    
    return cleaned;
  }

  /**
   * Get embedding dimension for the current model
   */
  getEmbeddingDimension(): number {
    // text-embedding-3-small has 1536 dimensions
    return 1536;
  }

  /**
   * Validate embedding vector
   */
  static validateEmbedding(embedding: Embedding): boolean {
    return (
      Array.isArray(embedding.vector) &&
      embedding.vector.length > 0 &&
      embedding.vector.every(val => typeof val === 'number' && !isNaN(val))
    );
  }
}
