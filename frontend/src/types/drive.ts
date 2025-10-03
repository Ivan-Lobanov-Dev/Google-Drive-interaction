export interface DriveFile {
  id: string
  userId: string
  name: string
  owner: string
  mimeType: string
  size?: string
  modifiedTime: string
  createdTime: string
  permissions?: unknown
  contentFetched: boolean
  extraMetadata?: {
    webViewLink?: string
    webContentLink?: string
    thumbnailLink?: string
    iconLink?: string
    description?: string
    starred?: boolean
    trashed?: boolean
    shared?: boolean
    ownedByMe?: boolean
    owners?: Array<{
      displayName?: string
      emailAddress?: string
      photoLink?: string
      me?: boolean
    }>
    parents?: string[]
    [key: string]: unknown
  }
  createdAt: string
  updatedAt: string
}

export interface DriveFilesResponse {
  files: DriveFile[]
  pagination: {
    page: number
    limit: number
    totalCount: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

export interface SyncResponse {
  message: string
  stats: {
    totalFetched: number
    totalSaved: number
    totalSkipped: number
    contentExtracted: number
    contentFailed: number
    totalDeleted: number
  }
}

export interface DriveFilesFilters {
  page?: number
  limit?: number
  modifiedAfter?: string
  modifiedBefore?: string
  mimeType?: string
  search?: string
}

export interface UpdateFileRequest {
  name?: string
  description?: string
}

export interface SyncRequest {
  modifiedAfter?: string
}


export interface ExtractContentResponse {
  message: string
  fileId: string
  chunksCount: number
}

export interface ExtractAllContentResponse {
  message: string
  stats: {
    totalProcessed: number
    successful: number
    failed: number
    totalChunks: number
  }
  results: Array<{
    fileId: string
    fileName: string
    success: boolean
    chunksCount: number
    error?: string
  }>
}
