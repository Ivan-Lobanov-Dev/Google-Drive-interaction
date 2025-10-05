import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick } from 'vue';
import DriveManager from '../DriveManager.vue';
import { DriveService } from '../../services/driveService';
import type { DriveFile } from '../../types/drive';

// Mock DriveService
vi.mock('../../services/driveService', () => ({
  DriveService: {
    getFiles: vi.fn(),
    syncFiles: vi.fn(),
    getSyncStatus: vi.fn(),
    resetSyncStatus: vi.fn(),
    updateFile: vi.fn(),
    deleteFile: vi.fn(),
    extractFileContent: vi.fn(),
    getFileIcon: vi.fn(() => '📄'),
    formatFileSize: vi.fn((size) => `${size} B`),
    formatDate: vi.fn((date) => new Date(date).toLocaleDateString()),
  },
}));

describe('DriveManager Sync Protection', () => {
  let wrapper: VueWrapper<typeof DriveManager>;

  const mockFiles: DriveFile[] = [
    {
      id: 'file1',
      userId: 'test-user-id',
      name: 'Test File 1',
      mimeType: 'text/plain',
      size: '1024',
      modifiedTime: '2024-01-01T10:00:00Z',
      createdTime: '2024-01-01T09:00:00Z',
      owner: 'test@example.com',
      contentFetched: false,
      extraMetadata: {},
      createdAt: '2024-01-01T09:00:00Z',
      updatedAt: '2024-01-01T10:00:00Z',
    },
  ];

  const mockPagination = {
    page: 1,
    limit: 9,
    totalCount: 1,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default mocks
    vi.mocked(DriveService.getFiles).mockResolvedValue({
      files: mockFiles,
      pagination: mockPagination,
    });
    
    vi.mocked(DriveService.syncFiles).mockResolvedValue({
      message: 'Files synchronized successfully',
      stats: {
        totalFetched: 1,
        totalSaved: 1,
        totalSkipped: 0,
        contentExtracted: 0,
        contentFailed: 0,
        totalDeleted: 0,
      },
    });
    
    vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
      isRunning: false,
    });

    wrapper = mount(DriveManager, {
      global: {
        stubs: ['router-link'],
      },
    });
  });

  afterEach(() => {
    wrapper.unmount();
  });

  describe('Sync Status Management', () => {
    it('should check sync status on component mount', async () => {
      await nextTick();
      
      expect(DriveService.getSyncStatus).toHaveBeenCalled();
      expect(DriveService.getFiles).toHaveBeenCalled();
    });

    it('should disable sync button when sync is running', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: true,
        startedAt: '2024-01-01T10:00:00Z',
      });

      await wrapper.vm.checkSyncStatus();
      await nextTick();

      const syncButton = wrapper.find('button[class*="btn-primary"]');
      expect(syncButton.attributes('disabled')).toBeDefined();
      expect(syncButton.text()).toContain('Syncing...');
    });

    it('should show reset button when sync is running', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: true,
        startedAt: '2024-01-01T10:00:00Z',
      });

      await wrapper.vm.checkSyncStatus();
      await nextTick();

      const resetButton = wrapper.find('button:contains("Reset Sync")');
      expect(resetButton.exists()).toBe(true);
    });

    it('should not show reset button when sync is not running', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });

      await wrapper.vm.checkSyncStatus();
      await nextTick();

      const resetButton = wrapper.find('button:contains("Reset Sync")');
      expect(resetButton.exists()).toBe(false);
    });
  });

  describe('Sync Operations', () => {
    it('should prevent sync when already running', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: true,
      });

      await wrapper.vm.syncFiles();

      expect(DriveService.syncFiles).not.toHaveBeenCalled();
      expect(wrapper.vm.error).toBe('Synchronization is already in progress. Please wait for it to complete.');
    });

    it('should start sync when not running', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });

      await wrapper.vm.syncFiles();

      expect(DriveService.syncFiles).toHaveBeenCalled();
      expect(DriveService.getSyncStatus).toHaveBeenCalledTimes(2); // Before and after sync
    });

    it('should handle sync already in progress error from backend', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });
      
      vi.mocked(DriveService.syncFiles).mockRejectedValue(
        new Error('Sync already in progress')
      );

      await wrapper.vm.syncFiles();

      expect(wrapper.vm.error).toBe('Synchronization is already in progress. Please wait for it to complete.');
    });

    it('should handle other sync errors', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });
      
      vi.mocked(DriveService.syncFiles).mockRejectedValue(
        new Error('Google Drive API error')
      );

      await wrapper.vm.syncFiles();

      expect(wrapper.vm.error).toBe('Google Drive API error');
    });

    it('should update sync status after successful sync', async () => {
      vi.mocked(DriveService.getSyncStatus)
        .mockResolvedValueOnce({ isRunning: false }) // Before sync
        .mockResolvedValueOnce({ isRunning: false }); // After sync

      await wrapper.vm.syncFiles();

      expect(DriveService.getSyncStatus).toHaveBeenCalledTimes(2);
      expect(wrapper.vm.lastOperation).toBeDefined();
      expect(wrapper.vm.lastOperation.type).toBe('Sync Files');
    });
  });

  describe('Reset Sync Functionality', () => {
    it('should reset sync status successfully', async () => {
      vi.mocked(DriveService.resetSyncStatus).mockResolvedValue({
        message: 'Sync status reset successfully',
      });
      
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });

      await wrapper.vm.resetSyncStatus();

      expect(DriveService.resetSyncStatus).toHaveBeenCalled();
      expect(DriveService.getSyncStatus).toHaveBeenCalled();
      expect(wrapper.vm.error).toBe('');
    });

    it('should handle reset sync error', async () => {
      vi.mocked(DriveService.resetSyncStatus).mockRejectedValue(
        new Error('Failed to reset sync status')
      );

      await wrapper.vm.resetSyncStatus();

      expect(wrapper.vm.error).toBe('Failed to reset sync status');
    });
  });

  describe('UI State Management', () => {
    it('should show loading state during sync', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });
      
      // Mock sync to take some time
      vi.mocked(DriveService.syncFiles).mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 100))
      );

      const syncPromise = wrapper.vm.syncFiles();
      
      // Check loading state
      expect(wrapper.vm.loading.sync).toBe(true);
      
      await syncPromise;
      
      // Check loading state after completion
      expect(wrapper.vm.loading.sync).toBe(false);
    });

    it('should display sync status information', async () => {
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: true,
        startedAt: '2024-01-01T10:00:00Z',
        errorMessage: undefined,
      });

      await wrapper.vm.checkSyncStatus();
      await nextTick();

      expect(wrapper.vm.syncStatus.isRunning).toBe(true);
      expect(wrapper.vm.syncStatus.startedAt).toBe('2024-01-01T10:00:00Z');
    });
  });

  describe('Error Handling', () => {
    it('should handle getSyncStatus failure gracefully', async () => {
      vi.mocked(DriveService.getSyncStatus).mockRejectedValue(
        new Error('Network error')
      );

      const result = await wrapper.vm.checkSyncStatus();

      expect(result).toBe(false);
      expect(wrapper.vm.syncStatus.isRunning).toBe(false);
    });

    it('should clear errors when starting new operations', async () => {
      wrapper.vm.error = 'Previous error';
      
      vi.mocked(DriveService.getSyncStatus).mockResolvedValue({
        isRunning: false,
      });

      await wrapper.vm.syncFiles();

      expect(wrapper.vm.error).toBe('');
    });
  });
});
