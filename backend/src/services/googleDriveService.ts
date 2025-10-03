import { google, drive_v3 } from 'googleapis';
import { prisma } from '../lib/prisma.js';
import { ContentExtractionService } from './contentExtractionService.js';

// Type for Google Drive API error
type GoogleDriveError = Error & {
  status?: number;
  code?: string;
  message?: string;
};

// Use the actual Google Drive API type
type DriveFileOwner = drive_v3.Schema$User;

// Extended file data type with additional properties
export interface DriveFileData extends drive_v3.Schema$File {
  owner?: string;
  extraMetadata?: {
    webViewLink?: string | null | undefined;
    webContentLink?: string | null | undefined;
    thumbnailLink?: string | null | undefined;
    iconLink?: string | null | undefined;
    description?: string | null | undefined;
    starred?: boolean;
    trashed?: boolean;
    shared?: boolean;
    ownedByMe?: boolean;
    owners?: drive_v3.Schema$User[] | undefined;
    parents?: string[] | undefined;
  };
}

export interface FetchFilesOptions {
  pageSize?: number;
  pageToken?: string;
  modifiedAfter?: string;
  query?: string;
}

export interface FetchFilesResult {
  files: DriveFileData[];
  nextPageToken?: string;
  totalFiles?: number;
}

export class GoogleDriveService {
  private drive: drive_v3.Drive;
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth });
  }

  /**
   * Get list of files from Google Drive with pagination
   */
  async fetchFiles(options: FetchFilesOptions = {}): Promise<FetchFilesResult> {
    const {
      pageSize = 100,
      pageToken,
      modifiedAfter,
      query
    } = options;

    try {
      // Build query for filtering
      let q = 'trashed=false'; // Exclude deleted files by default
      
      if (modifiedAfter) {
        q += ` and modifiedTime > '${modifiedAfter}'`;
      }
      
      if (query) {
        q += ` and ${query}`;
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

      const files: DriveFileData[] = response.data.files || [];

      return {
        files,
        nextPageToken: response.data.nextPageToken ?? '',
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

  /**
   * Get information about specific file
   */
  async getFile(fileId: string): Promise<DriveFileData | null> {
    try {
      const response = await this.drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, ownedByMe, owners(displayName, emailAddress, photoLink, me), parents, permissions'
      });

      const file = response.data as drive_v3.Schema$File;
      const owner = file.owners?.find((owner: DriveFileOwner) => owner.me)?.emailAddress || 
                   file.owners?.[0]?.emailAddress || 
                   'unknown';

      return {
        id: file.id!,
        name: file.name || 'Untitled',
        mimeType: file.mimeType || 'unknown',
        size: file.size || null,
        modifiedTime: file.modifiedTime!,
        createdTime: file.createdTime!,
        owner,
        permissions: file.permissions || [],
        extraMetadata: {
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink,
          thumbnailLink: file.thumbnailLink,
          iconLink: file.iconLink,
          description: file.description,
          starred: file.starred || false,
          trashed: file.trashed || false,
          shared: file.shared || false,
          ownedByMe: file.ownedByMe || false,
          owners: file.owners,
          parents: file.parents || undefined
        }
      };
    } catch (error) {
      console.error('Error fetching file from Google Drive:', error);
      return null;
    }
  }

  /**
   * Delete file from Google Drive
   */
  async deleteFile(fileId: string): Promise<boolean> {
    try {
      await this.drive.files.delete({ fileId });
      return true;
    } catch (error) {
      console.error('Error deleting file from Google Drive:', error);
      return false;
    }
  }

  /**
   * Update file metadata
   */
  async updateFile(fileId: string, updates: Partial<{ name: string; description: string }>): Promise<DriveFileData | null> {
    try {
      const response = await this.drive.files.update({
        fileId,
        requestBody: updates,
        fields: 'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, webContentLink, thumbnailLink, iconLink, description, starred, trashed, shared, ownedByMe, owners(displayName, emailAddress, photoLink, me), parents, permissions'
      });

      const file = response.data as drive_v3.Schema$File;
      const owner = file.owners?.find((owner: DriveFileOwner) => owner.me)?.emailAddress || 
                   file.owners?.[0]?.emailAddress || 
                   'unknown';

      return {
        id: file.id!,
        name: file.name || 'Untitled',
        mimeType: file.mimeType || 'unknown',
        size: file.size || null,
        modifiedTime: file.modifiedTime!,
        createdTime: file.createdTime!,
        owner,
        permissions: file.permissions || [],
        extraMetadata: {
          webViewLink: file.webViewLink,
          webContentLink: file.webContentLink,
          thumbnailLink: file.thumbnailLink,
          iconLink: file.iconLink,
          description: file.description,
          starred: file.starred || false,
          trashed: file.trashed || false,
          shared: file.shared || false,
          ownedByMe: file.ownedByMe || false,
          owners: file.owners,
          parents: file.parents || undefined
        }
      };
    } catch (error) {
      console.error('Error updating file in Google Drive:', error);
      return null;
    }
  }

  /**
   * Save files to database with duplicate checking and automatic content extraction
   */
  async saveFilesToDatabase(userId: string, files: DriveFileData[]): Promise<{ saved: number; skipped: number; contentExtracted: number; contentFailed: number }> {
    let saved = 0;
    let skipped = 0;
    let contentExtracted = 0;
    let contentFailed = 0;

    // Create service for content extraction
    const contentService = new ContentExtractionService(this.accessToken);

    for (const file of files) {
      try {
        // Check if file exists in database for this user
        const existingFile = await prisma.filesMetadata.findFirst({
          where: { 
            id: file.id!,
            userId: userId 
          }
        });

        // If file exists and hasn't changed, skip it
        if (existingFile && existingFile.modifiedTime.toISOString() === new Date(file.modifiedTime!).toISOString()) {
          skipped++;
          continue;
        }

        // Find file owner
        const owner = file.owners?.find((owner: DriveFileOwner) => owner.me)?.emailAddress || 
                     file.owners?.[0]?.emailAddress || 
                     'unknown';

        // Determine if content needs to be extracted again
        const shouldExtractContent = !existingFile || 
          existingFile.modifiedTime.toISOString() !== new Date(file.modifiedTime!).toISOString() ||
          !existingFile.contentFetched;

        // Create or update file
        await prisma.filesMetadata.upsert({
          where: { 
            id_userId: {
              id: file.id!,
              userId: userId
            }
          },
          update: {
            name: file.name || 'Untitled',
            owner: owner,
            mimeType: file.mimeType || 'unknown',
            size: file.size ? BigInt(file.size) : null,
            modifiedTime: new Date(file.modifiedTime!),
            createdTime: new Date(file.createdTime!),
            permissions: file.permissions ? JSON.parse(JSON.stringify(file.permissions)) : undefined,
            extraMetadata: {
              webViewLink: file.webViewLink,
              webContentLink: file.webContentLink,
              thumbnailLink: file.thumbnailLink,
              iconLink: file.iconLink,
              description: file.description,
              starred: file.starred || false,
              trashed: file.trashed || false,
              shared: file.shared || false,
              ownedByMe: file.ownedByMe || false,
              owners: file.owners ? JSON.parse(JSON.stringify(file.owners)) : undefined,
              parents: file.parents || undefined ? JSON.parse(JSON.stringify(file.parents)) : undefined
            },
            // Reset flag if file has changed
            contentFetched: shouldExtractContent ? false : existingFile?.contentFetched || false
          },
          create: {
            id: file.id!,
            userId: userId,
            name: file.name || 'Untitled',
            owner: owner,
            mimeType: file.mimeType || 'unknown',
            size: file.size ? BigInt(file.size) : null,
            modifiedTime: new Date(file.modifiedTime!),
            createdTime: new Date(file.createdTime!),
            permissions: file.permissions ? JSON.parse(JSON.stringify(file.permissions)) : undefined,
            extraMetadata: {
              webViewLink: file.webViewLink,
              webContentLink: file.webContentLink,
              thumbnailLink: file.thumbnailLink,
              iconLink: file.iconLink,
              description: file.description,
              starred: file.starred || false,
              trashed: file.trashed || false,
              shared: file.shared || false,
              ownedByMe: file.ownedByMe || false,
              owners: file.owners ? JSON.parse(JSON.stringify(file.owners)) : undefined,
              parents: file.parents || undefined ? JSON.parse(JSON.stringify(file.parents)) : undefined
            },
            contentFetched: false
          }
        });

        saved++;

        // Automatically extract content if file supports it and content needs updating
        if (shouldExtractContent && this.canExtractContent(file.mimeType || 'unknown')) {
          try {
            console.log(`Auto-extracting content for file: ${file.name || 'Untitled'} (${file.id})`);
            const extractResult = await contentService.processFile(file.id!, file.mimeType || 'unknown');
            
            if (extractResult.success) {
              contentExtracted++;
              console.log(`✓ Content extracted for ${file.name || 'Untitled'}: ${extractResult.chunksCount} chunks`);
            } else {
              contentFailed++;
              console.log(`✗ Failed to extract content for ${file.name || 'Untitled'}: ${extractResult.error}`);
            }
          } catch (extractError) {
            contentFailed++;
            console.error(`Error auto-extracting content for file ${file.id}:`, extractError);
          }
        }

        // Small pause between files to avoid overloading API
        if (saved % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

      } catch (error) {
        console.error(`Error saving file ${file.id} to database:`, error);
        skipped++;
      }
    }

    return { saved, skipped, contentExtracted, contentFailed };
  }

  /**
   * Check if file supports content extraction
   */
  private canExtractContent(mimeType: string): boolean {
    const supportedTypes = [
      // Google Workspace files
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      
      // PDF files
      'application/pdf',
      
      // Microsoft Office files
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint', // .ppt
      
      // Text and structured files
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'text/rtf',
      'application/json',
      'application/xml',
      'application/rtf'
    ];
    
    // Support all text types
    return supportedTypes.includes(mimeType) || mimeType.startsWith('text/');
  }
}
