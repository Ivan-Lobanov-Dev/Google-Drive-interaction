import { ContentExtractionService } from '../services/contentExtractionService.js';
import { FileService } from '../services/fileService.js';
import { RAGService } from '../services/ragService.js';
import { prisma } from '../lib/prisma.js';
import type { CloudStorageService, CloudFile } from '../interfaces/cloudStorage.js';

export interface SyncFilesResult {
  message: string;
  stats: {
    totalFetched: number;
    totalSaved: number;
    totalSkipped: number;
    contentExtracted: number;
    contentFailed: number;
    totalDeleted: number;
    filesIndexed: number;
    indexingErrors: number;
  };
}

export interface ExtractContentResult {
  message: string;
  fileId: string;
  chunksCount: number;
}

export interface ExtractAllContentResult {
  message: string;
  stats: {
    totalProcessed: number;
    successful: number;
    failed: number;
    totalChunks: number;
  };
  results: Array<{
    fileId: string;
    fileName: string;
    success: boolean;
    chunksCount: number;
    error?: string;
  }>;
}

export class DriveUseCases {
  constructor(
    private cloudStorageService: CloudStorageService,
    private contentService: ContentExtractionService
  ) {}

  /**
   * Sync files with cloud storage
   */
  async syncFiles(userId: string): Promise<SyncFilesResult> {
    let totalFetched = 0;
    let totalSaved = 0;
    let totalSkipped = 0;
    let totalContentExtracted = 0;
    let totalContentFailed = 0;
    let totalDeleted = 0;
    let nextPageToken: string | undefined;
    
    // Fetch all files from Google Drive
    // The saveFilesToDatabase method will handle:
    // - Creating new files that don't exist in DB
    // - Updating existing files if their modifiedTime has changed
    // - Skipping files that haven't changed
    
    do {
      const result = await this.cloudStorageService.fetchFiles({
        pageSize: 100,
        ...(nextPageToken && { pageToken: nextPageToken })
      });

      totalFetched += result.files.length;

      if (result.files.length > 0) {
        const saveResult = await this.cloudStorageService.saveFilesToDatabase(userId, result.files);
        totalSaved += saveResult.saved;
        totalSkipped += saveResult.skipped;
        totalContentExtracted += saveResult.contentExtracted;
        totalContentFailed += saveResult.contentFailed;
        totalDeleted += saveResult.deleted;
      }

      nextPageToken = result.nextPageToken;
    } while (nextPageToken);

    // After sync is complete, index files for RAG search
    let filesIndexed = 0;
    let indexingErrors = 0;
    
    if (totalSaved > 0) {
      try {
        const ragService = new RAGService();
        
        // Get files that need indexing (have content but no embeddings)
        const filesToIndex = await prisma.filesMetadata.findMany({
          where: {
            userId: userId,
            contentFetched: true,
            chunks: {
              some: {
                embedding: null
              }
            }
          },
          include: {
            chunks: true
          }
        });

        // Index each file
        for (const file of filesToIndex) {
          try {
            const result = await ragService.indexFile(file.id, userId);
            if (result.success) {
              filesIndexed += 1;
            } else {
              indexingErrors += 1;
            }
          } catch {
            indexingErrors += 1;
          }
        }
      } catch (error) {
        console.error('Error during RAG indexing:', error);
        indexingErrors += 1;
      }
    }

    return {
      message: 'Files synchronized and indexed for AI search',
      stats: {
        totalFetched,
        totalSaved,
        totalSkipped,
        contentExtracted: totalContentExtracted,
        contentFailed: totalContentFailed,
        totalDeleted,
        filesIndexed,
        indexingErrors
      }
    };
  }

  /**
   * Extract content from a single file
   */
  async extractFileContent(fileId: string, userId: string): Promise<ExtractContentResult> {
    // Find file in database
    const dbFile = await prisma.filesMetadata.findFirst({
      where: { 
        id: fileId,
        userId
      }
    });

    if (!dbFile) {
      throw new Error('File not found');
    }

    // Process file
    const result = await this.contentService.processFile(dbFile.id, dbFile.mimeType);

    if (!result.success) {
      throw new Error(result.error || 'Failed to extract content');
    }

    return {
      message: 'Content extracted and chunked successfully',
      fileId: dbFile.id,
      chunksCount: result.chunksCount
    };
  }

  /**
   * Extract content from all user files
   */
  async extractAllContent(userId: string, batchSize: number = 5): Promise<ExtractAllContentResult> {
    // Get files for which content has not been extracted yet
    const filesToProcess = await prisma.filesMetadata.findMany({
      where: {
        userId,
        contentFetched: false
      },
      take: batchSize
    });

    if (filesToProcess.length === 0) {
      return {
        message: 'No files to process',
        stats: {
          totalProcessed: 0,
          successful: 0,
          failed: 0,
          totalChunks: 0
        },
        results: []
      };
    }

    let successful = 0;
    let failed = 0;
    let totalChunks = 0;
    const results: Array<{
      fileId: string;
      fileName: string;
      success: boolean;
      chunksCount: number;
      error?: string;
    }> = [];

    // Process files sequentially to avoid overloading the API
    for (const file of filesToProcess) {
      try {
        const result = await this.contentService.processFile(file.id, file.mimeType);
        
        if (result.success) {
          successful++;
          totalChunks += result.chunksCount;
        } else {
          failed++;
        }

        results.push({
          fileId: file.id,
          fileName: file.name,
          success: result.success,
          chunksCount: result.chunksCount,
          ...(result.error && { error: result.error })
        });

        // Small pause between files
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        failed++;
        results.push({
          fileId: file.id,
          fileName: file.name,
          success: false,
          chunksCount: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      message: 'Content extraction completed',
      stats: {
        totalProcessed: filesToProcess.length,
        successful,
        failed,
        totalChunks
      },
      results
    };
  }

  /**
   * Get files from database with filtering
   */
  async getFiles(userId: string, filters: Record<string, unknown> = {}): Promise<unknown> {
    const fileService = new FileService();
    return fileService.getFiles(userId, filters);
  }

  /**
   * Get single file by ID
   */
  async getFileById(userId: string, fileId: string): Promise<unknown> {
    const fileService = new FileService();
    return fileService.getFileById(fileId, userId);
  }

  /**
   * Update file metadata
   */
  async updateFile(userId: string, fileId: string, accessToken: string, updates: { name?: string; description?: string }): Promise<CloudFile | null> {
    // Update in cloud storage
    const cloudFile = await this.cloudStorageService.updateFile(fileId, updates);
    
    if (cloudFile) {
      // Update in database
      const fileService = new FileService();
      await fileService.updateFile(fileId, userId, accessToken, updates);
    }
    
    return cloudFile;
  }

  /**
   * Delete file
   */
  async deleteFile(userId: string, fileId: string, accessToken: string): Promise<{ message: string }> {
    // Delete from cloud storage
    const deleted = await this.cloudStorageService.deleteFile(fileId);
    
    if (deleted) {
      // Delete from database
      const fileService = new FileService();
      const result = await fileService.deleteFile(fileId, userId, accessToken);
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete file from database');
      }
    }
    
    return { message: 'File deleted successfully' };
  }
}
