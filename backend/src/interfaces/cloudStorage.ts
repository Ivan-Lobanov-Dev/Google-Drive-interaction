/**
 * Universal interface for cloud storage services
 * Allows easy switching between Google Drive, AWS S3, Dropbox, etc.
 */

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  createdTime: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
  description?: string;
  starred?: boolean;
  trashed?: boolean;
  shared?: boolean;
  ownedByMe?: boolean;
  owners?: CloudFileOwner[];
  parents?: string[];
  permissions?: CloudFilePermission[];
  extraMetadata?: unknown;
}

export interface CloudFileOwner {
  displayName?: string;
  emailAddress?: string;
  photoLink?: string;
  me?: boolean;
}

export interface CloudFilePermission {
  id: string;
  type: string;
  role: string;
  emailAddress?: string;
}

export interface FetchFilesOptions {
  pageSize?: number;
  pageToken?: string;
  modifiedAfter?: string;
  query?: string;
}

export interface FetchFilesResult {
  files: CloudFile[];
  nextPageToken?: string;
  totalFiles?: number;
}

export interface SaveFilesResult {
  saved: number;
  skipped: number;
  contentExtracted: number;
  contentFailed: number;
  deleted: number;
}

export interface CloudStorageService {
  /**
   * Fetch files from cloud storage
   */
  fetchFiles(_options: FetchFilesOptions): Promise<FetchFilesResult>;

  /**
   * Get specific file by ID
   */
  getFile(_fileId: string): Promise<CloudFile | null>;

  /**
   * Update file metadata
   */
  updateFile(_fileId: string, _updates: Partial<CloudFile>): Promise<CloudFile | null>;

  /**
   * Delete file
   */
  deleteFile(_fileId: string): Promise<boolean>;

  /**
   * Save files to database
   */
  saveFilesToDatabase(_userId: string, _files: CloudFile[]): Promise<SaveFilesResult>;
}
