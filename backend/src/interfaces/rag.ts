/**
 * RAG (Retrieval-Augmented Generation) interfaces
 * Architecture: Extractor → Chunker → Embedder → Vector Store → Retriever → RAG Orchestrator → Answering
 */

export interface Chunk {
  id: string;
  fileId: string;
  text: string;
  chunkIndex: number;
  embedding?: number[]; // Vector embedding
  metadata?: {
    fileName: string;
    fileType: string;
    owner: string;
    createdAt: Date;
  };
}

export interface Embedding {
  vector: number[];
  dimension: number;
  model: string;
}

export interface SearchResult {
  chunk: Chunk;
  similarity: number;
  score: number;
}

export interface RAGQuery {
  question: string;
  userId: string;
  maxResults?: number;
  similarityThreshold?: number;
  maxTokens?: number; // Safety limit
  filters?: {
    dateRange?: {
      from?: Date;
      to?: Date;
    };
    owner?: string;
    fileType?: string;
  };
}

export interface RAGResponse {
  answer: string;
  confidence: number;
  sources: Array<{
    fileName: string;
    chunkText: string;
    similarity: number;
    fileId: string;
  }>;
  reasoning?: string;
  totalChunksSearched: number;
  tokensUsed?: number;
}

export interface RAGConfig {
  maxTokens: number;
  maxResults: number;
  similarityThreshold: number;
  embeddingModel: string;
  chunkSize: number;
  chunkOverlap: number;
}

// RAG Components Interfaces
export interface Chunker {
  chunkText(text: string, chunkSize?: number, overlap?: number): Promise<Chunk[]>;
}

export interface Embedder {
  embedText(text: string): Promise<Embedding>;
  embedBatch(texts: string[]): Promise<Embedding[]>;
}

export interface VectorStore {
  storeChunks(chunks: Chunk[]): Promise<void>;
  searchSimilar(queryEmbedding: number[], userId: string, limit: number, threshold: number): Promise<SearchResult[]>;
  deleteFileChunks(fileId: string): Promise<void>;
}

export interface Retriever {
  retrieve(query: RAGQuery): Promise<SearchResult[]>;
}

export interface RAGOrchestrator {
  processQuery(query: RAGQuery): Promise<RAGResponse>;
}
