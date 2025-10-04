export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size: number
  modifiedTime: string
  createdTime: string
  owner?: string
}

export interface AIAnswer {
  question: string
  answer: string
  confidence: number
  sources: string[]
  reasoning?: string
  type?: 'metadata' | 'content' | 'empty'
  statistics?: FileStatistics
  context?: Array<{
    fileId: string
    fileName: string
    chunkIndex: number
    text: string
  }>
  totalFiles?: number
  totalChunks?: number
  filters?: Record<string, unknown>
  timestamp?: string
}

export interface FileStatistics {
  totalFiles: number
  totalSize: number
  averageSize: number
  fileTypes: Record<string, number>
  owners: Record<string, number>
  recentFiles: DriveFile[]
  largestFiles: DriveFile[]
}

export interface IngestionPlan {
  totalFiles: number
  filesToProcess: number
  alreadyProcessed: number
  estimatedChunks: number
  strategy: 'batch' | 'sequential'
  fileTypes: string[]
  estimatedTime: string
  recommendations: string[]
}

export interface IngestionPlanResponse {
  plan: IngestionPlan
  timestamp: string
}
