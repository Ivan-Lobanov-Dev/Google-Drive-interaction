import { GoogleDriveAdapter } from '../adapters/googleDriveAdapter.js';
import { ContentExtractionService } from '../services/contentExtractionService.js';
import { DriveUseCases } from '../useCases/driveUseCases.js';
import type { CloudStorageService } from '../interfaces/cloudStorage.js';

export class ServiceFactory {
  /**
   * Create cloud storage service
   * Currently uses Google Drive, but can be easily extended for other providers
   */
  static createCloudStorageService(accessToken: string): CloudStorageService {
    // For now, we use Google Drive
    // In the future, this can be easily extended to support other providers
    // by checking environment variables or configuration
    return new GoogleDriveAdapter(accessToken);
  }

  /**
   * Create ContentExtractionService instance
   */
  static createContentService(accessToken: string): ContentExtractionService {
    return new ContentExtractionService(accessToken);
  }

  /**
   * Create DriveUseCases instance with injected dependencies
   */
  static createDriveUseCases(accessToken: string): DriveUseCases {
    const cloudStorageService = this.createCloudStorageService(accessToken);
    const contentService = this.createContentService(accessToken);
    
    return new DriveUseCases(cloudStorageService, contentService);
  }
}
