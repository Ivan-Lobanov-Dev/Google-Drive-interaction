import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';
import { prisma } from '../lib/prisma.js';
import { SyncStatusService } from '../services/syncStatusService.js';

// Mock Google Drive adapter to avoid real API calls
vi.mock('../adapters/googleDriveAdapter.js', () => ({
  GoogleDriveAdapter: vi.fn().mockImplementation(() => ({
    fetchFiles: vi.fn().mockResolvedValue({
      files: [
        {
          id: 'file1',
          name: 'Test File 1',
          mimeType: 'text/plain',
          size: 1024,
          modifiedTime: new Date('2024-01-01T10:00:00Z'),
          createdTime: new Date('2024-01-01T09:00:00Z'),
          owners: ['test@example.com'],
          extraMetadata: {},
        },
      ],
      nextPageToken: undefined,
    }),
    saveFilesToDatabase: vi.fn().mockResolvedValue({
      saved: 1,
      skipped: 0,
      contentExtracted: 0,
      contentFailed: 0,
      deleted: 0,
    }),
  })),
}));

// Mock content extraction service
vi.mock('../services/contentExtractionService.js', () => ({
  ContentExtractionService: vi.fn().mockImplementation(() => ({
    extractContent: vi.fn(),
    chunkText: vi.fn().mockReturnValue([]),
  })),
}));

describe('Drive Sync Protection E2E', () => {
  const testUserId = '550e8400-e29b-41d4-a716-446655440000';
  const testSessionId = '550e8400-e29b-41d4-a716-446655440001';

  beforeEach(async () => {
    // Clean up test data
    await prisma.syncStatus.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.filesMetadata.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.userSession.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });

    // Create test user
    await prisma.user.create({
      data: {
        id: testUserId,
        googleUserId: 'google-test-user',
        email: 'e2e-test@example.com',
        name: 'E2E Test User',
      },
    });

    // Create test session
    await prisma.userSession.create({
      data: {
        userId: testUserId,
        sessionId: testSessionId,
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
        tokenExpiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      },
    });
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.syncStatus.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.filesMetadata.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.userSession.deleteMany({
      where: { userId: testUserId },
    });
    await prisma.user.deleteMany({
      where: { id: testUserId },
    });
  });

  describe('Sync Protection Flow', () => {
    it('should prevent concurrent sync operations', async () => {
      // First, start a sync to create a running status
      await SyncStatusService.startSync(testUserId);

      // Try to start second sync immediately - should be blocked
      const secondSyncResponse = await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(409);

      expect(secondSyncResponse.body).toEqual({
        error: 'Sync already in progress',
        message: 'Please wait for the current synchronization to complete before starting a new one',
      });

      // Clean up
      await SyncStatusService.completeSync(testUserId);
    });

    it('should allow sync after previous sync completes', async () => {
      // Start and complete first sync
      await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      // Check that sync status is not running
      const statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(false);

      // Start second sync - should be allowed
      const secondSyncResponse = await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(secondSyncResponse.body.message).toBe('Files synchronized successfully');
    });

    it('should track sync status throughout the process', async () => {
      // Check initial status
      let statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(false);

      // Manually start sync status to simulate running state
      await SyncStatusService.startSync(testUserId);

      // Check status while running
      statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(true);
      expect(statusResponse.body.startedAt).toBeDefined();

      // Complete sync
      await SyncStatusService.completeSync(testUserId);

      // Check final status
      statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(false);
      expect(statusResponse.body.completedAt).toBeDefined();
      expect(statusResponse.body.errorMessage).toBeNull();
    });

    it('should handle sync reset functionality', async () => {
      // Manually create a stuck sync status
      await prisma.syncStatus.create({
        data: {
          userId: testUserId,
          isRunning: true,
          startedAt: new Date(Date.now() - 300000), // 5 minutes ago
          errorMessage: null,
        },
      });

      // Verify sync is marked as running
      let statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(true);

      // Try to start new sync - should be blocked
      await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(409);

      // Reset sync status
      await request(app)
        .post('/api/drive/sync/reset')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      // Verify sync status is reset
      statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(false);
      expect(statusResponse.body.errorMessage).toBe('Reset by system');

      // Now should be able to start new sync
      await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);
    });

    it('should handle sync failure and mark as failed', async () => {
      // Manually start sync and mark it as failed
      await SyncStatusService.startSync(testUserId);
      await SyncStatusService.failSync(testUserId, 'Google Drive API error');

      // Check that sync status is marked as failed
      const statusResponse = await request(app)
        .get('/api/drive/sync/status')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      expect(statusResponse.body.isRunning).toBe(false);
      expect(statusResponse.body.errorMessage).toBe('Google Drive API error');
    });
  });

  describe('Database Consistency', () => {
    it('should maintain sync status consistency across multiple operations', async () => {
      // Start sync
      await request(app)
        .post('/api/drive/sync')
        .set('Cookie', `sessionId=${testSessionId}`)
        .expect(200);

      // Verify sync status in database
      const syncStatus = await prisma.syncStatus.findUnique({
        where: { userId: testUserId },
      });

      expect(syncStatus).toBeDefined();
      expect(syncStatus?.isRunning).toBe(false);
      expect(syncStatus?.startedAt).toBeDefined();
      expect(syncStatus?.completedAt).toBeDefined();
      expect(syncStatus?.errorMessage).toBeNull();
    });

    it('should handle cleanup of old sync statuses', async () => {
      // Create old completed sync status
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      await prisma.syncStatus.create({
        data: {
          userId: testUserId,
          isRunning: false,
          startedAt: oldDate,
          completedAt: oldDate,
          errorMessage: null,
        },
      });

      // Run cleanup
      await SyncStatusService.cleanupOldSyncStatuses();

      // Verify old status is cleaned up
      const syncStatus = await prisma.syncStatus.findUnique({
        where: { userId: testUserId },
      });

      expect(syncStatus).toBeNull();
    });
  });
});
