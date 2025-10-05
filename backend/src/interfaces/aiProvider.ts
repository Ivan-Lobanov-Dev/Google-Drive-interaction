export interface AIProvider {
  answerQuestion(context: QuestionContext): Promise<AIResponse>;
  getFileStatistics(files: DriveFileData[]): Promise<FileStatistics>;
}

export interface DriveFileData {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  createdTime: string;
  owner?: string;
  webViewLink?: string;
}

export interface FileChunk {
  fileId: string;
  fileName: string;
  chunkIndex: number;
  text: string;
}

export interface QuestionContext {
  question: string;
  files: DriveFileData[];
  userEmail: string;
  chunks?: FileChunk[];
}

export interface AIResponse {
  answer: string;
  confidence: number;
  sources: string[];
  reasoning?: string;
  statistics?: FileStatistics;
}

export interface FileStatistics {
  totalFiles: number;
  totalSize: number;
  averageSize: number;
  fileTypes: Record<string, number>;
  owners: Record<string, number>;
  recentFiles: DriveFileData[];
  largestFiles: DriveFileData[];
}
