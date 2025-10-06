import OpenAI from 'openai';
import { RAGQuery, RAGResponse, RAGOrchestrator } from '../../interfaces/rag.js';
import { RAGRetriever } from './retriever.js';
import { TokenEstimator, RAG_CONFIG } from '../../config/rag.js';

/**
 * RAG Orchestrator
 * Coordinates the entire RAG pipeline with safety limits
 */
export class RAGOrchestratorImpl implements RAGOrchestrator {
  private openai: OpenAI;
  private retriever: RAGRetriever;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.retriever = new RAGRetriever();
  }

  /**
   * Process a RAG query with safety checks
   */
  async processQuery(query: RAGQuery): Promise<RAGResponse> {
    try {
      // 1. Retrieve relevant chunks
      const searchResults = await this.retriever.retrieve(query);
      
      if (searchResults.length === 0) {
        return {
          answer: "I couldn't find any relevant content in your documents to answer this question.",
          confidence: 0.0,
          sources: [],
          reasoning: "No relevant chunks found in vector search",
          totalChunksSearched: 0
        };
      }

      // 2. Safety check: Estimate tokens
      const chunks = searchResults.map(result => ({ text: result.chunk.text }));
      const estimatedTokens = TokenEstimator.estimateRAGTokens(query.question, chunks);
      
      if (!TokenEstimator.isSafeToProcess(query.question, chunks)) {
        console.error(`🚨 SAFETY CHECK FAILED: Query would use ${estimatedTokens} tokens (limit: ${RAG_CONFIG.maxTokens})`);
        console.error(`Query: "${query.question}"`);
        console.error(`Chunks found: ${searchResults.length}`);
        console.error(`Chunk lengths: ${chunks.map(c => c.text.length).join(', ')}`);
        
        return {
          answer: "I found relevant content, but the query is too complex to process safely. Please try rephrasing your question to be more specific.",
          confidence: 0.0,
          sources: [],
          reasoning: `Query too large: ${estimatedTokens} tokens (limit: ${RAG_CONFIG.maxTokens})`,
          totalChunksSearched: searchResults.length,
          tokensUsed: estimatedTokens
        };
      }

      // 3. Build context from retrieved chunks
      const context = this.buildContext(searchResults);
      
      // 4. Generate answer using OpenAI
      const answer = await this.generateAnswer(query.question, context);
      
      // 5. Calculate confidence based on similarity scores
      const confidence = this.calculateConfidence(searchResults);

      // 6. Format sources
      const sources = searchResults.map(result => ({
        fileName: result.chunk.metadata?.fileName || 'Unknown',
        chunkText: result.chunk.text.substring(0, 200) + (result.chunk.text.length > 200 ? '...' : ''),
        similarity: result.similarity,
        fileId: result.chunk.fileId
      }));


      return {
        answer: answer.answer,
        confidence,
        sources,
        reasoning: answer.reasoning || 'Answer generated from document content',
        totalChunksSearched: searchResults.length,
        tokensUsed: estimatedTokens
      };

    } catch (error) {
      console.error('Error in RAG orchestrator:', error);
      throw new Error(`RAG processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build context string from search results
   */
  private buildContext(searchResults: Array<{ chunk: { text: string; metadata?: { fileName?: string } }; similarity: number }>): string {
    return searchResults
      .map((result, index) => {
        const fileName = result.chunk.metadata?.fileName || 'Unknown';
        const similarity = (result.similarity * 100).toFixed(1);
        return `[Source ${index + 1}] File: ${fileName} (Similarity: ${similarity}%)
${result.chunk.text}`;
      })
      .join('\n\n');
  }

  /**
   * Generate answer using OpenAI
   */
  private async generateAnswer(question: string, context: string): Promise<{
    answer: string;
    reasoning?: string;
  }> {
    try {
      const systemPrompt = `You are an AI assistant that answers questions based on provided document content.

Guidelines:
- Answer ONLY based on the provided context
- If the answer is not in the context, say "I cannot find the answer to this question in the provided documents"
- Be specific and cite which source(s) you used
- If multiple sources have conflicting information, mention this
- Keep answers concise but complete
- Format your response as JSON: {"answer": "your answer", "reasoning": "brief explanation"}`;

      const userPrompt = `Question: ${question}

Context from documents:
${context}

Please answer the question based on the provided context.`;

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 500
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      try {
        // Try to parse JSON response
        const parsed = JSON.parse(response);
        return {
          answer: parsed.answer || response,
          reasoning: parsed.reasoning
        };
      } catch {
        // If not JSON, treat as plain text
        return {
          answer: response,
          reasoning: 'Response parsed as plain text'
        };
      }
    } catch (error) {
      console.error('Error generating answer:', error);
      throw new Error(`Failed to generate answer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Calculate confidence based on similarity scores
   */
  private calculateConfidence(searchResults: Array<{ similarity: number }>): number {
    if (searchResults.length === 0) return 0.0;
    
    // Average similarity score
    const avgSimilarity = searchResults.reduce((sum, result) => sum + result.similarity, 0) / searchResults.length;
    
    // Adjust confidence based on number of results
    const countBonus = Math.min(searchResults.length * 0.05, 0.2); // Up to 20% bonus for multiple sources
    
    return Math.min(avgSimilarity + countBonus, 1.0);
  }

  /**
   * Check if RAG is ready for a user
   */
  async isReady(userId: string): Promise<boolean> {
    return await this.retriever.hasIndexedContent(userId);
  }

  /**
   * Get RAG statistics for a user
   */
  async getStats(userId: string): Promise<{
    indexedChunks: number;
    totalChunks: number;
    lastIndexed?: Date;
  }> {
    return await this.retriever.getRetrievalStats(userId);
  }
}
