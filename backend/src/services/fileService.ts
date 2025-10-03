import { prisma } from '../lib/prisma.js';
import { Prisma } from '@prisma/client';
import { GoogleDriveAdapter } from '../adapters/googleDriveAdapter.js';

export interface FileFilters {
  page?: number;
  limit?: number;
  search?: string;
  mimeType?: string;
  modifiedAfter?: string;
  contentFetched?: boolean;
}

export interface FileListResult {
  files: Array<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    modifiedTime: string;
    createdTime: string;
    contentFetched: boolean;
    extraMetadata?: unknown;
  }>;
  pagination: {
    nextPageToken?: string;
    totalCount?: number;
    page?: number;
    limit?: number;
  };
}

export class FileService {
  /**
   * Get files with filtering and pagination
   */
  async getFiles(userId: string, filters: FileFilters = {}): Promise<FileListResult> {
    const {
      page = 1,
      limit = 20,
      search,
      mimeType,
      modifiedAfter,
      contentFetched
    } = filters;

    const where: Prisma.FilesMetadataWhereInput = {
      userId
    };

    if (modifiedAfter) {
      where.modifiedTime = {
        gte: new Date(modifiedAfter),
        ...(where.modifiedTime as Record<string, unknown> || {})
      };
    }

    if (typeof contentFetched === 'boolean') {
      where.contentFetched = contentFetched;
    }

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive'
      };
    }

    if (mimeType) {
      where.mimeType = mimeType;
    }

    const skip = (page - 1) * limit;
    
    const [files, totalCount] = await Promise.all([
      prisma.filesMetadata.findMany({
        where,
        orderBy: { modifiedTime: 'desc' },
        take: limit,
        skip,
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          modifiedTime: true,
          createdTime: true,
          contentFetched: true,
          extraMetadata: true
        }
      }),
      prisma.filesMetadata.count({ where })
    ]);

    return {
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: Number(file.size || 0),
        modifiedTime: file.modifiedTime.toISOString(),
        createdTime: file.createdTime.toISOString(),
        contentFetched: file.contentFetched,
        extraMetadata: file.extraMetadata
      })),
      pagination: {
        totalCount,
        page: page,
        limit: limit
      }
    };
  }

  /**
   * Get single file by ID
   */
  async getFileById(fileId: string, userId: string): Promise<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    modifiedTime: string;
    createdTime: string;
    contentFetched: boolean;
    extraMetadata: unknown;
  } | null> {
    const file = await prisma.filesMetadata.findFirst({
      where: { 
        id: fileId,
        userId 
      },
      select: {
        id: true,
        name: true,
        mimeType: true,
        size: true,
        modifiedTime: true,
        createdTime: true,
        contentFetched: true,
        extraMetadata: true
      }
    });

    if (!file) {
      return null;
    }

    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: Number(file.size || 0),
      modifiedTime: file.modifiedTime.toISOString(),
      createdTime: file.createdTime.toISOString(),
      contentFetched: file.contentFetched,
      extraMetadata: file.extraMetadata
    };
  }

  /**
   * Update file metadata in both Google Drive and database
   */
  async updateFile(fileId: string, userId: string, accessToken: string, updates: { name?: string; description?: string }): Promise<{
    id: string;
    name: string;
    mimeType: string;
    size: number;
    modifiedTime: string;
    createdTime: string;
    contentFetched: boolean;
    extraMetadata: unknown;
  } | null> {
    const file = await prisma.filesMetadata.findFirst({
      where: { 
        id: fileId,
        userId 
      }
    });

    if (!file) {
      return null;
    }

    try {
      // Update file in Google Drive first
      const driveAdapter = new GoogleDriveAdapter(accessToken);
      const updateData: { name?: string; description?: string } = {};
      
      if (updates.name) {
        updateData.name = updates.name;
      }
      if (updates.description) {
        updateData.description = updates.description;
      }
      
      const driveFile = await driveAdapter.updateFile(fileId, updateData);

      if (!driveFile) {
        throw new Error('Failed to update file in Google Drive');
      }

      // Update local database with the latest data from Google Drive
      const updatedFile = await prisma.filesMetadata.update({
        where: {
          id_userId: {
            id: fileId,
            userId
          }
        },
        data: {
          name: driveFile.name,
          modifiedTime: new Date(driveFile.modifiedTime),
          extraMetadata: {
            ...(file.extraMetadata as Record<string, unknown> || {}),
            ...(driveFile.description && { description: driveFile.description }),
            ...(driveFile.webViewLink && { webViewLink: driveFile.webViewLink }),
            ...(driveFile.webContentLink && { webContentLink: driveFile.webContentLink }),
            ...(driveFile.thumbnailLink && { thumbnailLink: driveFile.thumbnailLink }),
            ...(driveFile.iconLink && { iconLink: driveFile.iconLink }),
            ...(driveFile.starred !== undefined && { starred: driveFile.starred }),
            ...(driveFile.trashed !== undefined && { trashed: driveFile.trashed }),
            ...(driveFile.shared !== undefined && { shared: driveFile.shared }),
            ...(driveFile.ownedByMe !== undefined && { ownedByMe: driveFile.ownedByMe }),
            ...(driveFile.owners && { owners: driveFile.owners }),
            ...(driveFile.parents && { parents: driveFile.parents })
          } as Prisma.InputJsonValue
        },
        select: {
          id: true,
          name: true,
          mimeType: true,
          size: true,
          modifiedTime: true,
          createdTime: true,
          contentFetched: true,
          extraMetadata: true
        }
      });

      return {
        id: updatedFile.id,
        name: updatedFile.name,
        mimeType: updatedFile.mimeType,
        size: Number(updatedFile.size || 0),
        modifiedTime: updatedFile.modifiedTime.toISOString(),
        createdTime: updatedFile.createdTime.toISOString(),
        contentFetched: updatedFile.contentFetched,
        extraMetadata: updatedFile.extraMetadata
      };
    } catch (error) {
      console.error('Error updating file in Google Drive:', error);
      throw new Error('Failed to update file in Google Drive');
    }
  }

  /**
   * Delete file from both Google Drive and database
   */
  async deleteFile(fileId: string, userId: string, accessToken: string): Promise<{ success: boolean; error?: string }> {
    const file = await prisma.filesMetadata.findFirst({
      where: { 
        id: fileId,
        userId 
      }
    });

    if (!file) {
      return { success: false, error: 'File not found' };
    }

    try {
      // Delete file from Google Drive first
      const driveAdapter = new GoogleDriveAdapter(accessToken);
      const driveDeleted = await driveAdapter.deleteFile(fileId);

      if (!driveDeleted) {
        console.warn(`File ${fileId} not found in Google Drive, proceeding with local deletion`);
      }

      // Delete from local database (cascade will handle chunks)
      await prisma.filesMetadata.delete({
        where: {
          id_userId: {
            id: fileId,
            userId
          }
        }
      });

      return { success: true };
    } catch (error) {
      console.error('Error deleting file:', error);
      return { success: false, error: 'Failed to delete file' };
    }
  }
}
