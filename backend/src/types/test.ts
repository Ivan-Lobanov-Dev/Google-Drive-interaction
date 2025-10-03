import type { User, UserSession } from '@prisma/client';

// Mock types for testing
export type MockUser = User & {
  createdAt: Date;
  updatedAt: Date;
};

export type MockUserSession = UserSession & {
  createdAt: Date;
  updatedAt: Date;
};

export type UserSessionWithUser = UserSession & {
  user: User;
};

// Mock service types
export type MockContentService = {
  extractFileContent: ReturnType<typeof import('vitest').vi.fn>;
  processFile: ReturnType<typeof import('vitest').vi.fn>;
};

export type MockDrive = {
  files: {
    get: ReturnType<typeof import('vitest').vi.fn>;
    export?: ReturnType<typeof import('vitest').vi.fn>;
  };
};

export type MockAuth = {
  setCredentials: ReturnType<typeof import('vitest').vi.fn>;
};

export type MockOAuth2Client = {
  generateAuthUrl: ReturnType<typeof import('vitest').vi.fn>;
  getToken: ReturnType<typeof import('vitest').vi.fn>;
  setCredentials: ReturnType<typeof import('vitest').vi.fn>;
};

// Test data types
export type ChunkData = {
  text: string;
  chunkIndex: number;
};

export type ProcessingResult = {
  success: boolean;
  chunksCount: number;
  error?: string;
};

export type FileResponse = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  createdTime: string;
  contentFetched: boolean;
};

// Global test environment types
declare global {
  var testUserId: string | undefined;
}
