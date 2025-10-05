import { prisma } from '../lib/prisma.js';

export interface SyncStatusInfo {
  isRunning: boolean;
  startedAt: Date | null;
  completedAt: Date | null;
  errorMessage: string | null;
}

export class SyncStatusService {
  /**
   * Start sync process for a user
   */
  static async startSync(userId: string): Promise<boolean> {
    try {
      // Try to create or update sync status
      await prisma.syncStatus.upsert({
        where: { userId },
        create: {
          userId,
          isRunning: true,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null
        },
        update: {
          isRunning: true,
          startedAt: new Date(),
          completedAt: null,
          errorMessage: null
        }
      });
      
      return true;
    } catch (error) {
      console.error('Failed to start sync status:', error);
      return false;
    }
  }

  /**
   * Complete sync process for a user
   */
  static async completeSync(userId: string): Promise<void> {
    try {
      await prisma.syncStatus.update({
        where: { userId },
        data: {
          isRunning: false,
          completedAt: new Date(),
          errorMessage: null
        }
      });
    } catch (error) {
      console.error('Failed to complete sync status:', error);
    }
  }

  /**
   * Mark sync as failed for a user
   */
  static async failSync(userId: string, errorMessage: string): Promise<void> {
    try {
      await prisma.syncStatus.update({
        where: { userId },
        data: {
          isRunning: false,
          completedAt: new Date(),
          errorMessage
        }
      });
    } catch (error) {
      console.error('Failed to mark sync as failed:', error);
    }
  }

  /**
   * Check if sync is currently running for a user
   */
  static async isSyncRunning(userId: string): Promise<boolean> {
    try {
      const syncStatus = await prisma.syncStatus.findUnique({
        where: { userId },
        select: { isRunning: true }
      });

      return syncStatus?.isRunning ?? false;
    } catch (error) {
      console.error('Failed to check sync status:', error);
      return false;
    }
  }

  /**
   * Get sync status for a user
   */
  static async getSyncStatus(userId: string): Promise<SyncStatusInfo | null> {
    try {
      const syncStatus = await prisma.syncStatus.findUnique({
        where: { userId },
        select: {
          isRunning: true,
          startedAt: true,
          completedAt: true,
          errorMessage: true
        }
      });

      if (!syncStatus) {
        return null;
      }

      return {
        isRunning: syncStatus.isRunning,
        startedAt: syncStatus.startedAt,
        completedAt: syncStatus.completedAt,
        errorMessage: syncStatus.errorMessage
      };
    } catch (error) {
      console.error('Failed to get sync status:', error);
      return null;
    }
  }

  /**
   * Reset sync status for a user (in case of stuck sync)
   */
  static async resetSyncStatus(userId: string): Promise<void> {
    try {
      await prisma.syncStatus.update({
        where: { userId },
        data: {
          isRunning: false,
          errorMessage: 'Reset by system'
        }
      });
    } catch (error) {
      console.error('Failed to reset sync status:', error);
    }
  }

  /**
   * Clean up old completed sync statuses (older than 24 hours)
   */
  static async cleanupOldSyncStatuses(): Promise<void> {
    try {
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);

      await prisma.syncStatus.deleteMany({
        where: {
          isRunning: false,
          completedAt: {
            lt: oneDayAgo
          }
        }
      });
    } catch (error) {
      console.error('Failed to cleanup old sync statuses:', error);
    }
  }
}
