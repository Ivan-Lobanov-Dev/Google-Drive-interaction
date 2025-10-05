import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SyncStatusService } from '../syncStatusService.js';
import { prisma } from '../../lib/prisma.js';

// Mock Prisma with proper typing
vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    syncStatus: {
      upsert: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('SyncStatusService', () => {
  const mockUserId = 'user-123';
  const mockSyncStatus = {
    id: 'sync-123',
    userId: mockUserId,
    isRunning: true,
    startedAt: new Date('2024-01-01T10:00:00Z'),
    completedAt: null,
    errorMessage: null,
    createdAt: new Date('2024-01-01T10:00:00Z'),
    updatedAt: new Date('2024-01-01T10:00:00Z'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('startSync', () => {
    it('should successfully start sync status', async () => {
      vi.mocked(prisma.syncStatus).upsert.mockResolvedValue(mockSyncStatus);

      const result = await SyncStatusService.startSync(mockUserId);

      expect(result).toBe(true);
      expect(vi.mocked(prisma.syncStatus).upsert).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        create: {
          userId: mockUserId,
          isRunning: true,
          startedAt: expect.any(Date),
          completedAt: null,
          errorMessage: null,
        },
        update: {
          isRunning: true,
          startedAt: expect.any(Date),
          completedAt: null,
          errorMessage: null,
        },
      });
    });

    it('should return false when upsert fails', async () => {
      vi.mocked(prisma.syncStatus).upsert.mockRejectedValue(new Error('Database error'));

      const result = await SyncStatusService.startSync(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('completeSync', () => {
    it('should successfully complete sync status', async () => {
      vi.mocked(prisma.syncStatus).update.mockResolvedValue(mockSyncStatus);

      await SyncStatusService.completeSync(mockUserId);

      expect(vi.mocked(prisma.syncStatus).update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          isRunning: false,
          completedAt: expect.any(Date),
          errorMessage: null,
        },
      });
    });

    it('should handle update failure gracefully', async () => {
      vi.mocked(prisma.syncStatus).update.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(SyncStatusService.completeSync(mockUserId)).resolves.not.toThrow();
    });
  });

  describe('failSync', () => {
    it('should successfully mark sync as failed', async () => {
      const errorMessage = 'Sync failed due to network error';
      vi.mocked(vi.mocked(prisma.syncStatus).update).mockResolvedValue(mockSyncStatus);

      await SyncStatusService.failSync(mockUserId, errorMessage);

      expect(vi.mocked(prisma.syncStatus).update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          isRunning: false,
          completedAt: expect.any(Date),
          errorMessage,
        },
      });
    });

    it('should handle update failure gracefully', async () => {
      vi.mocked(prisma.syncStatus).update.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(SyncStatusService.failSync(mockUserId, 'Error')).resolves.not.toThrow();
    });
  });

  describe('isSyncRunning', () => {
    it('should return true when sync is running', async () => {
      const mockSyncStatusPartial = {
        isRunning: true,
        id: 'sync-123',
        userId: mockUserId,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.syncStatus).findUnique.mockResolvedValue(mockSyncStatusPartial);

      const result = await SyncStatusService.isSyncRunning(mockUserId);

      expect(result).toBe(true);
      expect(vi.mocked(prisma.syncStatus).findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        select: { isRunning: true },
      });
    });

    it('should return false when sync is not running', async () => {
      const mockSyncStatusPartial = {
        isRunning: false,
        id: 'sync-123',
        userId: mockUserId,
        startedAt: null,
        completedAt: null,
        errorMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.syncStatus).findUnique.mockResolvedValue(mockSyncStatusPartial);

      const result = await SyncStatusService.isSyncRunning(mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when no sync status exists', async () => {
      vi.mocked(prisma.syncStatus).findUnique.mockResolvedValue(null);

      const result = await SyncStatusService.isSyncRunning(mockUserId);

      expect(result).toBe(false);
    });

    it('should return false when database query fails', async () => {
      vi.mocked(vi.mocked(prisma.syncStatus).findUnique).mockRejectedValue(new Error('Database error'));

      const result = await SyncStatusService.isSyncRunning(mockUserId);

      expect(result).toBe(false);
    });
  });

  describe('getSyncStatus', () => {
    it('should return sync status when exists', async () => {
      const expectedStatus = {
        isRunning: true,
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: null,
        errorMessage: null,
      };
      const mockSyncStatusFull = {
        ...expectedStatus,
        id: 'sync-123',
        userId: mockUserId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      vi.mocked(prisma.syncStatus).findUnique.mockResolvedValue(mockSyncStatusFull);

      const result = await SyncStatusService.getSyncStatus(mockUserId);

      expect(result).toEqual(expectedStatus);
      expect(vi.mocked(prisma.syncStatus).findUnique).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        select: {
          isRunning: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true,
        },
      });
    });

    it('should return null when no sync status exists', async () => {
      vi.mocked(prisma.syncStatus).findUnique.mockResolvedValue(null);

      const result = await SyncStatusService.getSyncStatus(mockUserId);

      expect(result).toBe(null);
    });

    it('should return null when database query fails', async () => {
      vi.mocked(vi.mocked(prisma.syncStatus).findUnique).mockRejectedValue(new Error('Database error'));

      const result = await SyncStatusService.getSyncStatus(mockUserId);

      expect(result).toBe(null);
    });
  });

  describe('resetSyncStatus', () => {
    it('should successfully reset sync status', async () => {
      vi.mocked(vi.mocked(prisma.syncStatus).update).mockResolvedValue(mockSyncStatus);

      await SyncStatusService.resetSyncStatus(mockUserId);

      expect(vi.mocked(prisma.syncStatus).update).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: {
          isRunning: false,
          errorMessage: 'Reset by system',
        },
      });
    });

    it('should handle update failure gracefully', async () => {
      vi.mocked(prisma.syncStatus).update.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(SyncStatusService.resetSyncStatus(mockUserId)).resolves.not.toThrow();
    });
  });

  describe('cleanupOldSyncStatuses', () => {
    it('should delete old completed sync statuses', async () => {
      vi.mocked(prisma.syncStatus).deleteMany.mockResolvedValue({ count: 5 });

      await SyncStatusService.cleanupOldSyncStatuses();

      expect(vi.mocked(prisma.syncStatus).deleteMany).toHaveBeenCalledWith({
        where: {
          isRunning: false,
          completedAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should handle delete failure gracefully', async () => {
      vi.mocked(prisma.syncStatus).deleteMany.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(SyncStatusService.cleanupOldSyncStatuses()).resolves.not.toThrow();
    });
  });
});
