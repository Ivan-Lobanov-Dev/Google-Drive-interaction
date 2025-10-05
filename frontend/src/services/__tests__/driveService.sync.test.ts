import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DriveService } from '../driveService';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock buildApiUrl
vi.mock('../../config/api', () => ({
  buildApiUrl: vi.fn((endpoint: string) => `http://localhost:4000${endpoint}`),
  DRIVE_ENDPOINTS: {
    FILES: '/api/drive/files',
    SYNC: '/api/drive/sync',
  },
}));

describe('DriveService Sync Methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getSyncStatus', () => {
    it('should fetch sync status successfully', async () => {
      const mockStatus = {
        isRunning: true,
        startedAt: '2024-01-01T10:00:00Z',
        completedAt: null,
        errorMessage: null,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      const result = await DriveService.getSyncStatus();

      expect(result).toEqual(mockStatus);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/drive/sync/status',
        expect.objectContaining({
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle fetch errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(DriveService.getSyncStatus()).rejects.toThrow('HTTP 500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(DriveService.getSyncStatus()).rejects.toThrow('Network error');
    });
  });

  describe('resetSyncStatus', () => {
    it('should reset sync status successfully', async () => {
      const mockResponse = {
        message: 'Sync status reset successfully',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await DriveService.resetSyncStatus();

      expect(result).toEqual(mockResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/drive/sync/reset',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle reset errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Failed to reset sync status' }),
      });

      await expect(DriveService.resetSyncStatus()).rejects.toThrow('Failed to reset sync status');
    });
  });

  describe('syncFiles', () => {
    it('should sync files successfully', async () => {
      const mockSyncResponse = {
        message: 'Files synchronized successfully',
        stats: {
          totalFetched: 10,
          totalSaved: 8,
          totalSkipped: 2,
          contentExtracted: 5,
          contentFailed: 1,
          totalDeleted: 0,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSyncResponse),
      });

      const result = await DriveService.syncFiles();

      expect(result).toEqual(mockSyncResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/drive/sync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({}),
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should sync files with request parameters', async () => {
      const mockSyncRequest = {
        modifiedAfter: '2024-01-01T00:00:00Z',
        includeDeleted: true,
      };

      const mockSyncResponse = {
        message: 'Files synchronized successfully',
        stats: {
          totalFetched: 5,
          totalSaved: 3,
          totalSkipped: 2,
          contentExtracted: 2,
          contentFailed: 0,
          totalDeleted: 1,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSyncResponse),
      });

      const result = await DriveService.syncFiles(mockSyncRequest);

      expect(result).toEqual(mockSyncResponse);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:4000/api/drive/sync',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(mockSyncRequest),
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        })
      );
    });

    it('should handle sync already in progress error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({
          error: 'Sync already in progress',
          message: 'Please wait for the current synchronization to complete before starting a new one',
        }),
      });

      await expect(DriveService.syncFiles()).rejects.toThrow('Sync already in progress');
    });

    it('should handle sync failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({
          error: 'Failed to sync files',
        }),
      });

      await expect(DriveService.syncFiles()).rejects.toThrow('Failed to sync files');
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(DriveService.syncFiles()).rejects.toThrow('HTTP 500');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeouts', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Request timeout'));

      await expect(DriveService.getSyncStatus()).rejects.toThrow('Request timeout');
    });

    it('should handle invalid JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(DriveService.getSyncStatus()).rejects.toThrow('Invalid JSON');
    });

    it('should handle empty responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(null),
      });

      const result = await DriveService.getSyncStatus();
      expect(result).toBeNull();
    });
  });

  describe('Request Configuration', () => {
    it('should include credentials in all requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await DriveService.getSyncStatus();
      await DriveService.resetSyncStatus();
      await DriveService.syncFiles();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach(call => {
        expect(call[1]).toHaveProperty('credentials', 'include');
      });
    });

    it('should include proper headers in all requests', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await DriveService.getSyncStatus();
      await DriveService.resetSyncStatus();
      await DriveService.syncFiles();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      mockFetch.mock.calls.forEach(call => {
        expect(call[1]).toHaveProperty('headers.Content-Type', 'application/json');
      });
    });
  });
});
