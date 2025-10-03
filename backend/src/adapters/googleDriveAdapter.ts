import { google, drive_v3 } from 'googleapis';
import { prisma } from '../lib/prisma.js';
import { ContentExtractionService } from '../services/contentExtractionService.js';
import type { 
  CloudStorageService, 
  CloudFile, 
  FetchFilesOptions, 
  FetchFilesResult, 
  SaveFilesResult 
} from '../interfaces/cloudStorage.js';

// Type for Google Drive API error
type GoogleDriveError = Error & {
  status?: number;
  code?: string;
  message?: string;
};

/**
 * Google Drive adapter implementing CloudStorageService interface
 * This allows easy switching to other cloud storage providers
 */
export class GoogleDriveAdapter implements CloudStorageService {
  private drive: drive_v3.Drive;
  private accessToken: string;
  private contentService: ContentExtractionService;

  constructor(accessToken: string, contentService?: ContentExtractionService) {
    this.accessToken = accessToken;
    this.contentService = contentService || new ContentExtractionService(accessToken);
    
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Convert Google Drive file to universal CloudFile format
   */
  private convertToCloudFile(file: drive_v3.Schema$File): CloudFile {
    const result: CloudFile = {
      id: file.id || '',
      name: file.name || '',
      mimeType: file.mimeType || '',
      size: Number(file.size || 0),
      modifiedTime: file.modifiedTime || '',
      createdTime: file.createdTime || '',
      starred: file.starred || false,
      trashed: file.trashed || false,
      shared: file.shared || false,
      ownedByMe: file.ownedByMe || false,
      owners: file.owners?.map(owner => ({
        ...(owner.displayName && { displayName: owner.displayName }),
        ...(owner.emailAddress && { emailAddress: owner.emailAddress }),
        ...(owner.photoLink && { photoLink: owner.photoLink }),
        ...(owner.me !== undefined && owner.me !== null && { me: owner.me })
      })) || [],
      parents: file.parents || [],
      permissions: file.permissions?.map(perm => ({
        id: perm.id || '',
        type: perm.type || '',
        role: perm.role || '',
        ...(perm.emailAddress && { emailAddress: perm.emailAddress })
      })) || [],
      extraMetadata: {
        webViewLink: file.webViewLink,
        webContentLink: file.webContentLink,
        thumbnailLink: file.thumbnailLink,
        iconLink: file.iconLink,
        description: file.description,
        starred: file.starred,
        trashed: file.trashed,
        shared: file.shared,
        ownedByMe: file.ownedByMe,
        owners: file.owners,
        parents: file.parents
      }
    };

    // Handle optional properties with proper undefined handling
    if (file.webViewLink) result.webViewLink = file.webViewLink;
    if (file.webContentLink) result.webContentLink = file.webContentLink;
    if (file.thumbnailLink) result.thumbnailLink = file.thumbnailLink;
    if (file.iconLink) result.iconLink = file.iconLink;
    if (file.description) result.description = file.description;

    return result;
  }

  async fetchFiles(options: FetchFilesOptions = {}): Promise<FetchFilesResult> {
    const {
      pageSize = 100,
      pageToken,
      modifiedAfter,
      query
    } = options;

    try {
      // Build query for filtering
      // We need to fetch all files (including trashed) to handle deletions
      let q = '';
      
      if (modifiedAfter) {
        q += `modifiedTime > '${modifiedAfter}'`;
      }
      
      if (query) {
        q += q ? ` and ${query}` : query;
      }
      
      // If no query conditions, fetch all files
      if (!q) {
        q = 'trashed=true or trashed=false';
      }

      const DRIVE_FILE_FIELDS =
        'nextPageToken, files(id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, ownedByMe, owners(displayName, emailAddress, photoLink, me), parents, permissions)';

      const response = await this.drive.files.list({
        pageSize,
        ...(pageToken ? { pageToken } : {}),
        q,
        fields: DRIVE_FILE_FIELDS,
        orderBy: 'modifiedTime desc'
      });

      const files: CloudFile[] = (response.data.files || []).map(file => this.convertToCloudFile(file));

      return {
        files,
        ...(response.data.nextPageToken && { nextPageToken: response.data.nextPageToken }),
        totalFiles: response.data.files?.length ?? 0
      };
    } catch (error: unknown) {
      const driveError = error as GoogleDriveError;
      console.error('Google Drive API Error:', driveError?.message || error);
      if (driveError?.status === 401) {
        console.error('Authentication failed - token may be expired');
      }
      throw new Error('Failed to fetch files from Google Drive');
    }
  }

  async getFile(fileId: string): Promise<CloudFile | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, ownedByMe, owners(displayName, emailAddress, photoLink, me), parents, permissions'
      });

      return this.convertToCloudFile(response.data);
    } catch (error: unknown) {
      const driveError = error as GoogleDriveError;
      if (driveError?.status === 404) {
        return null;
      }
      console.error('Error fetching file:', driveError?.message || error);
      throw new Error('Failed to fetch file from Google Drive');
    }
  }

  async updateFile(fileId: string, updates: Partial<CloudFile>): Promise<CloudFile | null> {
    try {
      const updateData: drive_v3.Schema$File = {};
      
      if (updates.name) {
        updateData.name = updates.name;
      }
      
      if (updates.description !== undefined) {
        updateData.description = updates.description;
      }

      const response = await this.drive.files.update({
        fileId,
        requestBody: updateData,
        fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, ownedByMe, owners(displayName, emailAddress, photoLink, me), parents, permissions'
      });

      return this.convertToCloudFile(response.data);
    } catch (error: unknown) {
      const driveError = error as GoogleDriveError;
      if (driveError?.status === 404) {
        return null;
      }
      console.error('Error updating file:', driveError?.message || error);
      throw new Error('Failed to update file in Google Drive');
    }
  }

  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.drive.files.delete({ fileId });
      return true;
    } catch (error: unknown) {
      const driveError = error as GoogleDriveError;
      if (driveError?.status === 404) {
        return false;
      }
      console.error('Error deleting file:', driveError?.message || error);
      throw new Error('Failed to delete file from Google Drive');
    }
  }

  async saveFilesToDatabase(userId: string, files: CloudFile[]): Promise<SaveFilesResult> {
    let saved = 0;
    let skipped = 0;
    let contentExtracted = 0;
    let contentFailed = 0;
    let deleted = 0;

    for (const file of files) {
      try {
        // Check if file is trashed (deleted in Google Drive)
        const extraMetadata = file.extraMetadata as Record<string, unknown> | undefined;
        if (extraMetadata?.trashed === true) {
          // Delete file from our database
          const existingFile = await prisma.filesMetadata.findFirst({
            where: {
              id: file.id,
              userId
            }
          });

          if (existingFile) {
            // Delete file and its chunks (cascade will handle chunks)
            await prisma.filesMetadata.delete({
              where: {
                id_userId: {
                  id: file.id,
                  userId
                }
              }
            });
            deleted++;
            console.log(`Deleted file ${file.id} (${file.name}) from database - was trashed in Google Drive`);
          }
          continue; // Skip processing this file further
        }

        // Check if file already exists
        const existingFile = await prisma.filesMetadata.findFirst({
          where: {
            id: file.id,
            userId
          }
        });

        let shouldExtractContent = false;

        if (existingFile) {
          // Check if file has actually changed
          const fileModifiedTime = new Date(file.modifiedTime);
          const existingModifiedTime = existingFile.modifiedTime;
          
          if (fileModifiedTime.getTime() !== existingModifiedTime.getTime() || 
              existingFile.name !== file.name ||
              existingFile.mimeType !== file.mimeType ||
              Number(existingFile.size) !== file.size) {
            
            // Update existing file
            await prisma.filesMetadata.update({
              where: {
                id_userId: {
                  id: file.id,
                  userId
                }
              },
              data: {
                name: file.name,
                mimeType: file.mimeType,
                size: BigInt(file.size),
                modifiedTime: fileModifiedTime,
                createdTime: new Date(file.createdTime),
                contentFetched: false, // Reset content extraction flag for updated files
                extraMetadata: file.extraMetadata || {}
              }
            });

            // Delete old chunks for updated files
            await prisma.fileChunk.deleteMany({
              where: {
                fileId: file.id
              }
            });

            saved++;
            shouldExtractContent = true; // Extract content for updated files
          } else {
            skipped++;
            // Don't extract content for unchanged files
          }
        } else {
          // Create new file
          await prisma.filesMetadata.create({
            data: {
              id: file.id,
              userId,
              name: file.name,
              owner: file.owners?.[0]?.emailAddress || 'unknown',
              mimeType: file.mimeType,
              size: BigInt(file.size),
              modifiedTime: new Date(file.modifiedTime),
              createdTime: new Date(file.createdTime),
              contentFetched: false,
              extraMetadata: file.extraMetadata || {}
            }
          });
          saved++;
          shouldExtractContent = true; // Extract content for new files
        }

        // Try to extract content only for new or updated files
        if (shouldExtractContent) {
          try {
            const content = await this.contentService.extractFileContent(file.id, file.mimeType);
            
            if (content && content.length > 0) {
              // Chunk the extracted content
              const chunkedContent = await this.contentService.chunkText(content);
              
              if (chunkedContent.length > 0) {
                // Save chunks to database
                const chunks = chunkedContent.map((chunk) => ({
                  fileId: file.id,
                  text: chunk.text,
                  chunkIndex: chunk.chunkIndex
                }));

                await prisma.fileChunk.createMany({
                  data: chunks
                });

                // Update file as content fetched
                await prisma.filesMetadata.update({
                  where: {
                    id_userId: {
                      id: file.id,
                      userId
                    }
                  },
                  data: {
                    contentFetched: true
                  }
                });

                contentExtracted++;
              } else {
                console.log(`No chunks created for file ${file.id} (${file.name})`);
                contentFailed++;
              }
            } else {
              console.log(`No content extracted for file ${file.id} (${file.name}) - unsupported type: ${file.mimeType}`);
              contentFailed++;
            }
          } catch (contentError) {
            console.error(`Failed to extract content for file ${file.id}:`, contentError);
            contentFailed++;
          }
        }
      } catch (error) {
        console.error(`Failed to save file ${file.id}:`, error);
        contentFailed++;
      }
    }

    return {
      saved,
      skipped,
      contentExtracted,
      contentFailed,
      deleted
    };
  }
}
