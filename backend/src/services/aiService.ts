import { AIProvider, DriveFileData, QuestionContext, AIResponse, FileStatistics } from '../interfaces/aiProvider.js';
import { OpenAIAdapter } from '../adapters/openaiAdapter.js';

export class AIService {
  private provider: AIProvider;

  constructor(provider?: AIProvider) {
    // Default to OpenAI, but allow injection of other providers
    this.provider = provider || new OpenAIAdapter();
  }

  /**
   * Set a different AI provider
   */
  setProvider(provider: AIProvider): void {
    this.provider = provider;
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider.constructor.name;
  }

  /**
   * Answer a question about Google Drive files
   */
  async answerQuestion(context: QuestionContext): Promise<AIResponse> {
    return this.provider.answerQuestion(context);
  }

  /**
   * Get file statistics
   */
  async getFileStatistics(files: DriveFileData[]): Promise<FileStatistics> {
    return this.provider.getFileStatistics(files);
  }
}
