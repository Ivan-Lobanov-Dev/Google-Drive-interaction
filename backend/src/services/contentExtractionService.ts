import { google, drive_v3 } from 'googleapis';
import { prisma } from '../lib/prisma.js';
import type { ChunkData } from '../types/test.js';
import { createRequire } from 'module';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

// Type definitions for external modules
type MammothModule = {
  extractRawText: Function;
  convertToHtml: Function;
};

type XLSXModule = {
  read: Function;
  utils: {
    sheet_to_csv: Function;
    sheet_to_txt: Function;
  };
};


// Use createRequire for CommonJS modules
const require = createRequire(import.meta.url);

// Initialize modules with error handling
let mammoth: MammothModule | null = null;
let XLSX: XLSXModule | null = null;

const initModules = (): void => {
  if (!mammoth) {
    try {
      mammoth = require('mammoth');
    } catch (error) {
      if (error instanceof Error) {
        console.warn('⚠ mammoth not available:', error.message);
      } else {
        console.warn('⚠ mammoth not available:', error);
      }
    }
  }
  
  if (!XLSX) {
    try {
      XLSX = require('xlsx');
    } catch (error) {
      if (error instanceof Error) {
        console.warn('⚠ xlsx not available:', error.message);
      } else {
        console.warn('⚠ xlsx not available:', error);
      }
    }
  }
};

// Initialize modules on load
initModules();


export class ContentExtractionService {
  private drive: drive_v3.Drive;
  private auth: InstanceType<typeof google.auth.OAuth2>;

  constructor(accessToken: string) {
    this.auth = new google.auth.OAuth2();
    this.auth.setCredentials({ access_token: accessToken });
    this.drive = google.drive({ version: 'v3', auth: this.auth });
  }


  /**
   * Extract text content from Google Drive file
   */
  async extractFileContent(fileId: string, mimeType: string): Promise<string | null> {
    try {
      let content = '';

      if (this.isGoogleDocsFile(mimeType)) {
        // Google Docs files - export as plain text
        content = await this.exportGoogleDocsAsText(fileId, mimeType);
      } else if (this.isPdfFile(mimeType)) {
        // PDF files - extract text using pdf-parse
        content = await this.extractPdfText(fileId);
      } else if (this.isDocxFile(mimeType)) {
        // .docx files - extract text using mammoth
        content = await this.extractDocxText(fileId);
      } else if (this.isExcelFile(mimeType)) {
        // Excel files (.xlsx, .xls) - extract text using xlsx
        content = await this.extractExcelText(fileId);
      } else if (this.isPowerPointFile(mimeType)) {
        // PowerPoint files - basic support only for now
        content = await this.extractPowerPointText(fileId);
      } else if (this.isTextFile(mimeType)) {
        // Regular text files
        content = await this.downloadTextFile(fileId);
      } else {
        // For other file types, return null for now
        return null;
      }

      return content.trim();
    } catch (error) {
      console.error(`Error extracting content from file ${fileId}:`, error);
      return null;
    }
  }

  /**
   * Split text into chunks using LangChain RecursiveCharacterTextSplitter
   */
  async chunkText(text: string, chunkSize: number = 800, overlap: number = 50): Promise<ChunkData[]> {
    if (!text || text.length === 0) {
      return [];
    }

    // Create text splitter with optimized settings
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: chunkSize,
      chunkOverlap: overlap,
      separators: [
        '\n\n',  // Paragraph breaks
        '\n',    // Line breaks
        '. ',    // Sentence endings
        '! ',    // Exclamation endings
        '? ',    // Question endings
        '; ',    // Semicolon breaks
        ', ',    // Comma breaks
        ' ',     // Word boundaries
        ''       // Character level (fallback)
      ],
      keepSeparator: false
    });

    // Split the text
    const textChunks = await textSplitter.splitText(text);
    
    // Convert to our ChunkData format
    const chunks: ChunkData[] = textChunks.map((chunkText, index) => ({
      text: chunkText.trim(),
      chunkIndex: index
    })).filter(chunk => chunk.text.length > 0); // Remove empty chunks

    return chunks;
  }

  /**
   * Save chunks to database
   */
  async saveChunksToDatabase(fileId: string, chunks: ChunkData[]): Promise<number> {
    try {
      // Check that file exists in database
      const fileExists = await prisma.filesMetadata.findFirst({
        where: { id: fileId },
        select: { id: true }
      });

      if (!fileExists) {
        console.error(`File ${fileId} not found in database, skipping chunk creation`);
        return 0;
      }

      // Delete existing chunks for this file
      await prisma.fileChunk.deleteMany({
        where: { fileId }
      });

      // Create new chunks
      if (chunks.length > 0) {
        try {
          await prisma.fileChunk.createMany({
            data: chunks.map(chunk => ({
              fileId,
              text: chunk.text,
              chunkIndex: chunk.chunkIndex
            }))
          });
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'P2003') {
            // Foreign key constraint - file may have been deleted during processing
            console.error(`Foreign key constraint error for file ${fileId}. File may have been deleted.`);
            return 0;
          }
          throw error; // Re-throw other errors
        }
      }

      // Update content_fetched flag in file
      await prisma.filesMetadata.updateMany({
        where: { id: fileId },
        data: { contentFetched: true }
      });

      return chunks.length;
    } catch (error) {
      console.error(`Error saving chunks for file ${fileId}:`, error);
      throw error;
    }
  }

  /**
   * Process file: extract content and create chunks
   */
  async processFile(fileId: string, mimeType: string): Promise<{ success: boolean; chunksCount: number; error?: string }> {
    try {
      // Extract content
      const content = await this.extractFileContent(fileId, mimeType);
      
      if (!content) {
        return { success: false, chunksCount: 0, error: 'No content extracted or unsupported file type' };
      }

      // Create chunks
      const chunks = await this.chunkText(content);
      
      if (chunks.length === 0) {
        return { success: false, chunksCount: 0, error: 'No chunks created from content' };
      }

      // Save chunks
      const savedChunks = await this.saveChunksToDatabase(fileId, chunks);

      return { success: true, chunksCount: savedChunks };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, chunksCount: 0, error: errorMessage };
    }
  }

  /**
   * Check if file is a Google Docs file
   */
  public isGoogleDocsFile(mimeType: string): boolean {
    const googleDocsMimeTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'application/vnd.google-apps.presentation'
    ];
    return googleDocsMimeTypes.includes(mimeType);
  }

  /**
   * Check if file is PDF
   */
  public isPdfFile(mimeType: string): boolean {
    return mimeType === 'application/pdf';
  }

  /**
   * Check if file is .docx or .doc
   */
  public isDocxFile(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
           mimeType === 'application/msword';
  }

  /**
   * Check if file is Excel (.xlsx, .xls)
   */
  public isExcelFile(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
           mimeType === 'application/vnd.ms-excel';
  }

  /**
   * Check if file is PowerPoint (.pptx, .ppt)
   */
  public isPowerPointFile(mimeType: string): boolean {
    return mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
           mimeType === 'application/vnd.ms-powerpoint';
  }

  /**
   * Check if file is text file
   */
  public isTextFile(mimeType: string): boolean {
    const textMimeTypes = [
      'text/plain',
      'text/csv',
      'text/html',
      'text/markdown',
      'application/json',
      'application/xml'
    ];
    return textMimeTypes.includes(mimeType) || mimeType.startsWith('text/');
  }

  /**
   * Export Google Docs file as text
   */
  private async exportGoogleDocsAsText(fileId: string, mimeType: string): Promise<string> {
    let exportMimeType = 'text/plain';
    
    // Determine correct MIME type for export
    switch (mimeType) {
      case 'application/vnd.google-apps.document':
        exportMimeType = 'text/plain';
        break;
      case 'application/vnd.google-apps.spreadsheet':
        exportMimeType = 'text/csv';
        break;
      case 'application/vnd.google-apps.presentation':
        exportMimeType = 'text/plain';
        break;
    }

    const response = await this.drive.files.export({
      fileId,
      mimeType: exportMimeType
    });

    return response.data as string;
  }

  /**
   * Download plain text file
   */
  private async downloadTextFile(fileId: string): Promise<string> {
    const response = await this.drive.files.get({
      fileId,
      alt: 'media'
    });

    return response.data as string;
  }

  /**
   * Extract text from PDF file using pdfjs-dist
   */
  private async extractPdfText(fileId: string): Promise<string> {
    try {
      // Download PDF file as buffer
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      }, { responseType: 'arraybuffer' });

      // Convert to Uint8Array for pdfjs-dist
      const pdfBuffer = new Uint8Array(response.data as ArrayBuffer);

      // Load PDF document
      const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
      const pdfDocument = await loadingTask.promise;

      let fullText = '';

      // Extract text from all pages
      for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
        const page = await pdfDocument.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        // Collect text from page
        const pageText = textContent.items
          .map((item) => {
            if ('str' in item) {
              return item.str;
            }
            return '';
          })
          .join(' ');
        
        fullText += pageText + '\n';
      }

      return fullText.trim();
    } catch (error) {
      console.error(`Error extracting PDF text from file ${fileId}:`, error);
      throw new Error(`Failed to extract PDF text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from Word file (.docx, .doc)
   */
  private async extractDocxText(fileId: string): Promise<string> {
    try {
      if (!mammoth) {
        throw new Error('mammoth module not available');
      }

      // Download file as buffer
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      }, { responseType: 'arraybuffer' });

      // Convert to Buffer
      const buffer = Buffer.from(response.data as ArrayBuffer);

      // Extract text using mammoth (supports .docx and partially .doc)
      if (!mammoth) {
        throw new Error('Mammoth module not available');
      }
      const result = await mammoth.extractRawText({ buffer });

      return result.value;
    } catch (error) {
      console.error(`Error extracting Word text from file ${fileId}:`, error);
      throw new Error(`Failed to extract Word text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from Excel file (.xlsx, .xls)
   */
  private async extractExcelText(fileId: string): Promise<string> {
    try {
      if (!XLSX) {
        throw new Error('xlsx module not available');
      }

      // Download file as buffer
      const response = await this.drive.files.get({
        fileId,
        alt: 'media'
      }, { responseType: 'arraybuffer' });

      // Convert to Buffer
      const buffer = Buffer.from(response.data as ArrayBuffer);

      // Read Excel file (supports .xlsx and .xls)
      if (!XLSX) {
        throw new Error('XLSX module not available');
      }
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Extract text from all sheets
      let allText = '';
      workbook.SheetNames.forEach((sheetName: string) => {
        const worksheet = workbook.Sheets[sheetName];
        
        // Add sheet name
        allText += `\n--- ${sheetName} ---\n`;
        
        // Convert sheet to CSV and add to overall text
        const csvData = XLSX!.utils.sheet_to_csv(worksheet);
        allText += csvData + '\n';
      });

      return allText.trim();
    } catch (error) {
      console.error(`Error extracting Excel text from file ${fileId}:`, error);
      throw new Error(`Failed to extract Excel text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from PowerPoint file (.pptx, .ppt)
   * Basic support - just return placeholder text for now
   */
  private async extractPowerPointText(_fileId: string): Promise<string> {
    // For PowerPoint files, return basic information for now
    // In the future, we can add a library for extracting text from slides
    return 'PowerPoint content extraction - coming soon';
  }

}
