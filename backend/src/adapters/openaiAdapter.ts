import OpenAI from 'openai';
import dotenv from 'dotenv';
import path from 'path';
import { 
  AIProvider, 
  DriveFileData, 
  QuestionContext, 
  AIResponse, 
  FileStatistics 
} from '../interfaces/aiProvider.js';

// Type for OpenAI API errors
interface OpenAIError {
  status?: number;
  headers?: Record<string, string>;
  error?: {
    type?: string;
    message?: string;
    code?: string;
  };
  message?: string;
}

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), '.env') });
dotenv.config({ path: path.join(process.cwd(), '.env.oauth') });
dotenv.config({ path: path.join(process.cwd(), '.env.ai') });

export class OpenAIAdapter implements AIProvider {
  private openai: OpenAI;

  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Analyze Google Drive data and answer user questions
   */
  async answerQuestion(context: QuestionContext): Promise<AIResponse> {
    try {
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(context);

      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: parseFloat(process.env.OPENAI_TEMPERATURE || '0.1'),
        max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '100'),
      });

      const response = completion.choices[0]?.message?.content;
      if (!response) {
        throw new Error('No response from OpenAI');
      }

      return this.parseAIResponse(response, context.files, context.question);
    } catch (error: unknown) {
      // Log error details for debugging
      console.error('OpenAI API error:', error);
      
      // Handle rate limit errors specifically
      const openAIError = error as OpenAIError;
      if (openAIError?.status === 429) {
        const retryAfter = openAIError.headers?.['retry-after'] || openAIError.headers?.['retry-after-ms'];
        const errorType = openAIError.error?.type || 'unknown';
        
        let message = 'AI service is temporarily busy. ';
        
        if (errorType === 'requests') {
          message += 'Rate limit reached for requests. Please wait a moment before trying again.';
        } else if (errorType === 'tokens') {
          message += 'Rate limit reached for tokens. Please wait a few minutes before trying again.';
        } else {
          message += 'Please try again in a few moments.';
        }
        
        if (retryAfter) {
          const seconds = Math.ceil(parseInt(retryAfter) / 1000);
          message += ` (Wait approximately ${seconds} seconds)`;
        }
        
        throw new Error(message);
      }
      
      throw new Error(`Failed to get AI response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Build system prompt with instructions for analyzing Google Drive data
   */
  private buildSystemPrompt(): string {
    return `You are an AI assistant that analyzes Google Drive file metadata.

Capabilities:
- Analyze file metadata (names, sizes, types, owners)
- Answer questions about file statistics and patterns
- Calculate metrics and distributions

Guidelines:
- Base answers on provided data only
- Be specific and quantitative
- Format response as JSON: {"answer": "text", "confidence": 0.0-1.0, "sources": ["file1"], "reasoning": "explanation"}
- If data insufficient, state what's missing

Common questions:
- File ownership and statistics
- File size analysis  
- File type distributions
- User activity patterns

Always provide confidence scores based on data completeness.`;
  }

  /**
   * Build user prompt with the question and file data
   */
  private buildUserPrompt(context: QuestionContext): string {
    const question = context.question.toLowerCase();
    
    // Create statistics based on question type
    const ownerCounts: Record<string, number> = {};
    const typeCounts: Record<string, number> = {};
    const sizeStats: number[] = [];
    const modifiedDates: string[] = [];
    let totalSize = 0;

    context.files.forEach(file => {
      const owner = file.owner || 'Unknown';
      const type = file.mimeType?.split('/')[0] || 'unknown';
      
      ownerCounts[owner] = (ownerCounts[owner] || 0) + 1;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
      totalSize += file.size || 0;
      
      if (file.size) sizeStats.push(file.size);
      if (file.modifiedTime) modifiedDates.push(file.modifiedTime);
    });

    let dataSections: string[] = [`Files: ${context.files.length}`];

    // Add relevant data based on question type
    if (question.includes('owner') || question.includes('most') || question.includes('who')) {
      // For ownership questions, include top owners
      const sortedOwners = Object.entries(ownerCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 15) // More owners for ownership questions
        .map(([owner, count]) => `${owner}:${count}`)
        .join(', ');
      dataSections.push(`Owners: ${sortedOwners}`);
    }

    if (question.includes('size') || question.includes('largest') || question.includes('average')) {
      // For size questions, include size statistics
      const avgSize = totalSize / context.files.length;
      const maxSize = Math.max(...sizeStats);
      dataSections.push(`Total size: ${Math.round(totalSize / 1024 / 1024)}MB`);
      dataSections.push(`Average size: ${Math.round(avgSize / 1024)}KB`);
      dataSections.push(`Max size: ${Math.round(maxSize / 1024 / 1024)}MB`);
    }

    if (question.includes('modified') || question.includes('recent') || question.includes('date')) {
      // For date questions, include recent files info
      const recentFiles = context.files
        .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
        .slice(0, 10)
        .map(file => `${file.name} (${file.modifiedTime.split('T')[0]})`)
        .join(', ');
      dataSections.push(`Recent files: ${recentFiles}`);
    }

    if (question.includes('type') || question.includes('distribution')) {
      // For type questions, include type distribution
      const sortedTypes = Object.entries(typeCounts)
        .sort(([,a], [,b]) => b - a)
        .map(([type, count]) => `${type}:${count}`)
        .join(', ');
      dataSections.push(`Types: ${sortedTypes}`);
    }

    if (question.includes('average')) {
      // For average questions, include calculated averages
      const avgFilesPerOwner = context.files.length / Object.keys(ownerCounts).length;
      dataSections.push(`Average files per owner: ${avgFilesPerOwner.toFixed(1)}`);
    }

    const prompt = `Q: "${context.question}"

Data:
${dataSections.map(section => `- ${section}`).join('\n')}

Answer based on this data.`;

    return prompt;
  }

  /**
   * Parse AI response and extract structured data
   */
  private parseAIResponse(response: string, files: DriveFileData[], question?: string): AIResponse {
    // Generate statistics from files
    const statistics = this.generateFileStatistics(files);
    
    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      return {
        answer: parsed.answer || response,
        confidence: parsed.confidence || 0.8,
        sources: [],
        reasoning: parsed.reasoning,
        statistics
      };
    } catch {
      // If not JSON, treat as plain text answer
      return {
        answer: response,
        confidence: 0.7,
        sources: [],
        reasoning: 'Response parsed as plain text',
        statistics
      };
    }
  }


  private generateFileStatistics(files: DriveFileData[]): FileStatistics {
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const averageSize = totalFiles > 0 ? Math.round(totalSize / totalFiles) : 0;
    
    // Count file types
    const fileTypes: Record<string, number> = {};
    files.forEach(file => {
      const type = file.mimeType?.split('/')[0] || 'unknown'; // Get main type (e.g., 'application' from 'application/pdf')
      fileTypes[type] = (fileTypes[type] || 0) + 1;
    });
    
    // Count owners
    const owners: Record<string, number> = {};
    files.forEach(file => {
      const owner = file.owner || 'Unknown';
      owners[owner] = (owners[owner] || 0) + 1;
    });
    
    // Get recent files (last 5)
    const recentFiles = [...files]
      .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
      .slice(0, 5);
    
    // Get largest files (top 5)
    const largestFiles = [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 5);
    
    return {
      totalFiles,
      totalSize,
      averageSize,
      fileTypes,
      owners,
      recentFiles,
      largestFiles
    };
  }

  /**
   * Get file statistics for common questions
   */
  async getFileStatistics(files: DriveFileData[]): Promise<FileStatistics> {
    const totalFiles = files.length;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    const averageSize = totalFiles > 0 ? totalSize / totalFiles : 0;

    // File types distribution
    const fileTypes: Record<string, number> = {};
    files.forEach(file => {
      const type = file.mimeType?.split('/')[0] || 'unknown'; // e.g., 'application', 'image'
      fileTypes[type] = (fileTypes[type] || 0) + 1;
    });

    // Owners distribution
    const owners: Record<string, number> = {};
    files.forEach(file => {
      const owner = file.owner || 'Unknown';
      owners[owner] = (owners[owner] || 0) + 1;
    });

    // Recent files (last 10)
    const recentFiles = [...files]
      .sort((a, b) => new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime())
      .slice(0, 10);

    // Largest files (top 10)
    const largestFiles = [...files]
      .sort((a, b) => b.size - a.size)
      .slice(0, 10);

    return {
      totalFiles,
      totalSize,
      averageSize,
      fileTypes,
      owners,
      recentFiles,
      largestFiles
    };
  }
}
