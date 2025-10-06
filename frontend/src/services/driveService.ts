import { buildApiUrl, DRIVE_ENDPOINTS } from '../config/api'
import type { 
  DriveFile, 
  DriveFilesResponse, 
  DriveFilesFilters, 
  SyncResponse, 
  UpdateFileRequest, 
  SyncRequest,
  ExtractContentResponse,
  ExtractAllContentResponse
} from '../types/drive'

export class DriveService {
  /**
   * Base method for working with Drive API
   */
  private static async makeRequest<T>(
    endpoint: string, 
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(buildApiUrl(endpoint), {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    return response.json()
  }

  /**
   * Get file list with filtering and pagination
   */
  static async getFiles(filters: DriveFilesFilters = {}): Promise<DriveFilesResponse> {
    const params = new URLSearchParams()
    
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, value.toString())
      }
    })

    const endpoint = params.toString() 
      ? `${DRIVE_ENDPOINTS.FILES}?${params.toString()}`
      : DRIVE_ENDPOINTS.FILES

    return this.makeRequest<DriveFilesResponse>(endpoint)
  }

  /**
   * Get specific file by ID
   */
  static async getFileById(id: string): Promise<DriveFile> {
    return this.makeRequest<DriveFile>(DRIVE_ENDPOINTS.FILE_BY_ID(id))
  }

  /**
   * Synchronize files with Google Drive (smart synchronization)
   * Gets all files that are not in DB or have been modified
   */
  static async syncFiles(request: SyncRequest = {}): Promise<SyncResponse> {
    return this.makeRequest<SyncResponse>(DRIVE_ENDPOINTS.SYNC, {
      method: 'POST',
      body: JSON.stringify(request)
    })
  }

  /**
   * Get current sync status
   */
  static async getSyncStatus(): Promise<{
    isRunning: boolean;
    startedAt?: string;
    completedAt?: string;
    errorMessage?: string;
  }> {
    return this.makeRequest('/api/drive/sync/status')
  }

  /**
   * Reset sync status (for stuck syncs)
   */
  static async resetSyncStatus(): Promise<{ message: string }> {
    return this.makeRequest('/api/drive/sync/reset', {
      method: 'POST'
    })
  }

  /**
   * Update file
   */
  static async updateFile(id: string, updates: UpdateFileRequest): Promise<{ message: string; file: DriveFile }> {
    return this.makeRequest<{ message: string; file: DriveFile }>(
      DRIVE_ENDPOINTS.FILE_BY_ID(id), 
      {
        method: 'PUT',
        body: JSON.stringify(updates)
      }
    )
  }

  /**
   * Delete file
   */
  static async deleteFile(id: string): Promise<{ message: string }> {
    return this.makeRequest<{ message: string }>(
      DRIVE_ENDPOINTS.FILE_BY_ID(id), 
      {
        method: 'DELETE'
      }
    )
  }

  /**
   * Format file size for display
   */
  static formatFileSize(bytes?: string): string {
    if (!bytes) return 'Unknown'
    
    const size = parseInt(bytes)
    if (isNaN(size)) return 'Unknown'
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let unitIndex = 0
    let fileSize = size

    while (fileSize >= 1024 && unitIndex < units.length - 1) {
      fileSize /= 1024
      unitIndex++
    }

    return `${fileSize.toFixed(1)} ${units[unitIndex]}`
  }

  /**
   * Format date for display
   */
  static formatDate(dateString: string): string {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('ru-RU', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'Invalid date'
    }
  }

  /**
   * Get icon for file type
   */
  static getFileIcon(mimeType: string): string {
    const iconMap: Record<string, string> = {
      'application/pdf': '📄',
      'application/msword': '📝',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '📝',
      'application/vnd.ms-excel': '📊',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '📊',
      'application/vnd.ms-powerpoint': '📋',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': '📋',
      'application/vnd.google-apps.document': '📝',
      'application/vnd.google-apps.spreadsheet': '📊',
      'application/vnd.google-apps.presentation': '📋',
      'application/vnd.google-apps.folder': '📁',
      'image/jpeg': '🖼️',
      'image/png': '🖼️',
      'image/gif': '🖼️',
      'text/plain': '📄',
      'application/zip': '🗜️',
      'application/json': '📄'
    }

    return iconMap[mimeType] || '📄'
  }

  /**
   * Extract content of specific file and create chunks
   */
  static async extractFileContent(id: string): Promise<ExtractContentResponse> {
    return this.makeRequest<ExtractContentResponse>(
      DRIVE_ENDPOINTS.EXTRACT_CONTENT(id), 
      {
        method: 'POST'
      }
    )
  }

  /**
   * Extract content of all files and create chunks
   */
  static async extractAllContent(batchSize: number = 5): Promise<ExtractAllContentResponse> {
    return this.makeRequest<ExtractAllContentResponse>(
      DRIVE_ENDPOINTS.EXTRACT_ALL_CONTENT, 
      {
        method: 'POST',
        body: JSON.stringify({ batchSize })
      }
    )
  }


  /**
   * Check if file supports content extraction
   */
  static canExtractContent(mimeType: string): boolean {
    const supportedTypes = [
      // Google Workspace files
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet', 
      'application/vnd.google-apps.presentation',
      
      // PDF files
      'application/pdf',
      
      // Microsoft Office files
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
      'application/msword', // .doc
      'application/vnd.ms-excel', // .xls
      'application/vnd.ms-powerpoint', // .ppt
      
      // Text and structured files
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'text/rtf',
      'application/json',
      'application/xml',
      'application/rtf'
    ]
    
    // Support all text types
    return supportedTypes.includes(mimeType) || mimeType.startsWith('text/')
  }

}
