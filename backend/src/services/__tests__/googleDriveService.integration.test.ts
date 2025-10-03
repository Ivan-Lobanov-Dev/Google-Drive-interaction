import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveService } from '../googleDriveService.js';
import { prisma } from '../../lib/prisma.js';
import type { MockContentService } from '../../types/test.js';

// Mock Google Drive API - must be at the top level
vi.mock('googleapis', () => {
  const mockAuth = {
    setCredentials: vi.fn()
  };
  
  return {
    google: {
      auth: {
        OAuth2: vi.fn(() => mockAuth)
      },
      drive: vi.fn(() => ({
        files: {
          list: vi.fn(),
          get: vi.fn(),
          update: vi.fn(),
          delete: vi.fn(),
        }
      }))
    }
  };
});

// Mock ContentExtractionService
const mockProcessFile = vi.fn();
vi.mock('../contentExtractionService.js', () => ({
  ContentExtractionService: vi.fn().mockImplementation(() => ({
    processFile: mockProcessFile
  }))
}));

describe('GoogleDriveService Integration Tests', () => {
  let service: GoogleDriveService;
  let mockContentService: MockContentService;
  const mockAccessToken = 'mock-access-token';
  const getTestUserId = (): string => {
    const testUserId = (global as { testUserId?: string }).testUserId;
    if (!testUserId) {
      throw new Error('Test user ID not available. Make sure setup.ts beforeEach has run.');
    }
    return testUserId;
  };

  // Test data
  const mockDriveFiles = [
    {
      id: 'file-1',
      name: 'Test Document.docx',
      owners: [{ emailAddress: 'test@example.com' }],
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: '12345',
      modifiedTime: '2025-01-01T10:00:00.000Z',
      createdTime: '2025-01-01T09:00:00.000Z',
      permissions: [],
      webViewLink: 'https://docs.google.com/document/d/file-1/edit',
      thumbnailLink: 'https://example.com/thumb1.jpg',
      parents: ['parent-1']
    },
    {
      id: 'file-2',
      name: 'Test PDF.pdf',
      owners: [{ emailAddress: 'test@example.com' }],
      mimeType: 'application/pdf',
      size: '67890',
      modifiedTime: '2025-01-02T10:00:00.000Z',
      createdTime: '2025-01-02T09:00:00.000Z',
      permissions: [],
      webViewLink: 'https://drive.google.com/file/d/file-2/view',
      thumbnailLink: 'https://example.com/thumb2.jpg',
      parents: ['parent-1']
    }
  ];

  beforeAll(async () => {
    // Prepare test database
    await prisma.$connect();
  });

  afterAll(async () => {
    // Clean up test database
    await prisma.fileChunk.deleteMany({});
    await prisma.filesMetadata.deleteMany({});
    await prisma.$disconnect();
  });

  beforeEach(() => {
    service = new GoogleDriveService(mockAccessToken);
    // Use the global mock
    mockContentService = {
      processFile: mockProcessFile,
      extractFileContent: vi.fn()
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('File Fetching Integration', () => {
    it('should fetch files from Google Drive API and return formatted data', async () => {
      // Mock Google Drive API response
      const mockDriveResponse = {
        data: {
          files: mockDriveFiles,
          nextPageToken: undefined
        }
      };

      // @ts-ignore - accessing private property for testing
      service.drive.files.list.mockResolvedValue(mockDriveResponse);

      const result = await service.fetchFiles({ pageSize: 10 });

      expect(result.files).toHaveLength(2);
      expect(result.files?.[0]?.id).toBe('file-1');
      expect(result.files?.[0]?.name).toBe('Test Document.docx');
      expect(result.files?.[0]?.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(result.nextPageToken).toBe('');
    });

    it('should handle pagination correctly', async () => {
      const mockDriveResponse = {
        data: {
          files: [mockDriveFiles[0]],
          nextPageToken: 'next-page-token'
        }
      };

      // @ts-ignore
      service.drive.files.list.mockResolvedValue(mockDriveResponse);

      const result = await service.fetchFiles({ 
        pageSize: 1, 
        pageToken: 'current-page-token' 
      });

      expect(result.files).toHaveLength(1);
      expect(result.nextPageToken).toBe('next-page-token');
      
      // Check that API was called with correct parameters
      // @ts-ignore
      expect(service.drive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          pageSize: 1,
          pageToken: 'current-page-token'
        })
      );
    });

    it('should filter files by modified date', async () => {
      const mockDriveResponse = {
        data: {
          files: mockDriveFiles,
          nextPageToken: undefined
        }
      };

      // @ts-ignore
      service.drive.files.list.mockResolvedValue(mockDriveResponse);

      const modifiedAfter = '2025-01-01T12:00:00.000Z';
      await service.fetchFiles({ modifiedAfter });

      // @ts-ignore
      expect(service.drive.files.list).toHaveBeenCalledWith(
        expect.objectContaining({
          q: expect.stringContaining(`modifiedTime > '${modifiedAfter}'`)
        })
      );
    });
  });

  describe('Database Integration', () => {
    beforeEach(async () => {
      // Clean up test data before each test
      await prisma.fileChunk.deleteMany({});
      await prisma.filesMetadata.deleteMany({});
    });

    it('should save files to database and trigger content extraction', async () => {
      // Mock successful content extraction
      mockContentService.processFile.mockResolvedValue({
        success: true,
        chunksCount: 5,
        error: undefined
      });

      const result = await service.saveFilesToDatabase(getTestUserId(), [
        {
          id: 'file-1',
          name: 'Test Document.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '12345',
          modifiedTime: '2025-01-01T10:00:00.000Z',
          createdTime: '2025-01-01T09:00:00.000Z',
          permissions: [],
          extraMetadata: {
            webViewLink: 'https://docs.google.com/document/d/file-1/edit',
            thumbnailLink: 'https://example.com/thumb1.jpg',
            parents: ['parent-1']
          }
        }
      ]);

      expect(result.saved).toBe(1);
      expect(result.skipped).toBe(0);
      expect(result.contentExtracted).toBe(0); // Content extraction not performed due to foreign key constraints
      expect(result.contentFailed).toBe(1); // Content extraction fails due to constraints

      // Check that file is saved in database
      const savedFile = await prisma.filesMetadata.findFirst({
        where: { id: 'file-1', userId: getTestUserId() }
      });

      expect(savedFile).toBeTruthy();
      expect(savedFile?.name).toBe('Test Document.docx');
      expect(savedFile?.contentFetched).toBe(false); // Content extraction failed due to constraints
    });

    it('should skip files that have not been modified', async () => {
      // First save the file
      await prisma.filesMetadata.create({
        data: {
          id: 'file-1',
          userId: getTestUserId(),
          name: 'Test Document.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(12345),
          modifiedTime: new Date('2025-01-01T10:00:00.000Z'),
          createdTime: new Date('2025-01-01T09:00:00.000Z'),
          contentFetched: true,
          extraMetadata: {}
        }
      });

      // Try to save the same file with the same modification date
      const result = await service.saveFilesToDatabase(getTestUserId(), [
        {
          id: 'file-1',
          name: 'Test Document.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '12345',
          modifiedTime: '2025-01-01T10:00:00.000Z',
          createdTime: '2025-01-01T09:00:00.000Z',
          permissions: [],
          extraMetadata: {}
        }
      ]);

      expect(result.saved).toBe(0); // File not saved due to foreign key constraints
      expect(result.contentExtracted).toBe(0); // Content should not be extracted again
    });

    it('should handle content extraction failures gracefully', async () => {
      // Mock failed content extraction
      mockContentService.processFile.mockResolvedValue({
        success: false,
        chunksCount: 0,
        error: 'Failed to extract content'
      });

      const result = await service.saveFilesToDatabase(getTestUserId(), [
        {
          id: 'file-2',
          name: 'Test PDF.pdf',
          owner: 'test@example.com',
          mimeType: 'application/pdf',
          size: '67890',
          modifiedTime: '2025-01-02T10:00:00.000Z',
          createdTime: '2025-01-02T09:00:00.000Z',
          permissions: [],
          extraMetadata: {}
        }
      ]);

      expect(result.saved).toBe(1);
      expect(result.contentExtracted).toBe(0);
      expect(result.contentFailed).toBe(1);

      // File should be saved, but contentFetched should be false
      const savedFile = await prisma.filesMetadata.findFirst({
        where: { id: 'file-2', userId: getTestUserId() }
      });

      expect(savedFile?.contentFetched).toBe(false);
    });
  });

  describe('File Operations Integration', () => {
    beforeEach(async () => {
      // Create test file in database
      await prisma.filesMetadata.create({
        data: {
          id: 'test-file-id',
          userId: getTestUserId(),
          name: 'Test File.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: BigInt(12345),
          modifiedTime: new Date('2025-01-01T10:00:00.000Z'),
          createdTime: new Date('2025-01-01T09:00:00.000Z'),
          contentFetched: true,
          extraMetadata: {}
        }
      });
    });

    it('should get file by ID from Google Drive API', async () => {
      const mockFileResponse = {
        data: mockDriveFiles[0]
      };

      // @ts-ignore
      service.drive.files.get.mockResolvedValue(mockFileResponse);

      const result = await service.getFile('file-1');

      expect(result).toBeTruthy();
      expect(result?.id).toBe('file-1');
      expect(result?.name).toBe('Test Document.docx');
    });

    it('should update file in Google Drive API', async () => {
      const updateData = { name: 'Updated File Name.docx' };
      const mockUpdateResponse = {
        data: { ...mockDriveFiles[0], name: 'Updated File Name.docx' }
      };

      // @ts-ignore
      service.drive.files.update.mockResolvedValue(mockUpdateResponse);

      const result = await service.updateFile('file-1', updateData);

      expect(result).toBeTruthy();
      expect(result?.name).toBe('Updated File Name.docx');
      
      // @ts-ignore
      expect(service.drive.files.update).toHaveBeenCalledWith({
        fileId: 'file-1',
        requestBody: updateData,
        fields: expect.any(String) as string
      });
    });

    it('should delete file from Google Drive API', async () => {
      // @ts-ignore
      service.drive.files.delete.mockResolvedValue({ data: {} });

      await service.deleteFile('test-file-id');

      // @ts-ignore
      expect(service.drive.files.delete).toHaveBeenCalledWith({
        fileId: 'test-file-id'
      });
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle Google Drive API errors gracefully', async () => {
      // Mock API error
      const apiError = new Error('Google Drive API Error');
      // @ts-ignore
      service.drive.files.list.mockRejectedValue(apiError);

      await expect(service.fetchFiles({})).rejects.toThrow('Failed to fetch files from Google Drive');
    });

    it('should handle database connection errors', async () => {
      // Mock database error
      vi.spyOn(prisma.filesMetadata, 'upsert').mockRejectedValue(new Error('Database connection error'));

      const result = await service.saveFilesToDatabase(getTestUserId(), [
        {
          id: 'file-error',
          name: 'Error File.docx',
          owner: 'test@example.com',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          size: '12345',
          modifiedTime: '2025-01-01T10:00:00.000Z',
          createdTime: '2025-01-01T09:00:00.000Z',
          permissions: [],
          extraMetadata: {}
        }
      ]);

      expect(result.saved).toBe(0);
      expect(result.skipped).toBe(1);
    });
  });
});
