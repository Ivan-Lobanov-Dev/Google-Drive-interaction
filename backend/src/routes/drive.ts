import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import { ServiceFactory } from '../factories/serviceFactory.js';
import { FileService } from '../services/fileService.js';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * GET /api/drive/files
 * Get files from database with pagination and filtering
 */
router.get('/files', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      page = '1',
      limit = '9',
      modifiedAfter,
      mimeType,
      search
    } = req.query;

    const fileService = new FileService();
    const result = await fileService.getFiles(req.user!.id, {
      page: parseInt(page as string),
      limit: parseInt(limit as string),
      search: search as string,
      mimeType: mimeType as string,
      modifiedAfter: modifiedAfter as string
    });

    return res.json(result);
  } catch (error) {
    console.error('Error fetching files:', error);
    return res.status(500).json({ error: 'Failed to fetch files' });
  }
});

/**
 * GET /api/drive/files/:id
 * Get single file by ID
 */
router.get('/files/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    const fileService = new FileService();
    const file = await fileService.getFileById(id, req.user!.id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.json(file);
  } catch (error) {
    console.error('Error fetching file:', error);
    return res.status(500).json({ error: 'Failed to fetch file' });
  }
});

/**
 * PUT /api/drive/files/:id
 * Update file metadata in Google Drive and database
 */
router.put('/files/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!req.session?.accessToken) {
      return res.status(401).json({ error: 'Access token not available' });
    }

    const fileService = new FileService();
    const updatedFile = await fileService.updateFile(id, req.user!.id, req.session.accessToken, { name, description });

    if (!updatedFile) {
      return res.status(404).json({ error: 'File not found' });
    }

    return res.json(updatedFile);
  } catch (error) {
    console.error('Error updating file:', error);
    return res.status(500).json({ error: 'Failed to update file' });
  }
});

/**
 * DELETE /api/drive/files/:id
 * Delete file from Google Drive and database
 */
router.delete('/files/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!req.session?.accessToken) {
      return res.status(401).json({ error: 'Access token not available' });
    }

    const fileService = new FileService();
    const result = await fileService.deleteFile(id, req.user!.id, req.session.accessToken);

    if (!result.success) {
      if (result.error === 'File not found') {
        return res.status(404).json({ error: 'File not found' });
      }
      return res.status(500).json({ error: result.error || 'Failed to delete file' });
    }

    return res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Error deleting file:', error);
    return res.status(500).json({ error: 'Failed to delete file' });
  }
});

/**
 * POST /api/drive/sync
 * Synchronize files with Google Drive (smart synchronization)
 */
router.post('/sync', async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.session?.accessToken) {
      return res.status(401).json({ error: 'Access token not available' });
    }

    // Always create new instances with current token to ensure fresh authentication
    const driveUseCases = ServiceFactory.createDriveUseCases(req.session.accessToken);
    const result = await driveUseCases.syncFiles(req.user!.id);

    return res.json(result);
  } catch (error) {
    console.error('Error syncing files:', error);
    return res.status(500).json({ error: 'Failed to sync files' });
  }
});

/**
 * POST /api/drive/files/:id/extract-content
 * Extract file content and create chunks
 */
router.post('/files/:id/extract-content', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'File ID is required' });
    }

    if (!req.session?.accessToken) {
      return res.status(401).json({ error: 'Access token not available' });
    }

    const driveUseCases = ServiceFactory.createDriveUseCases(req.session.accessToken);
    const result = await driveUseCases.extractFileContent(id, req.user!.id);

    return res.json(result);
  } catch (error) {
    console.error('Error extracting content:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to extract content';
    return res.status(400).json({ error: errorMessage });
  }
});

/**
 * POST /api/drive/extract-all-content
 * Extract content from all user files and create chunks
 */
router.post('/extract-all-content', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { batchSize = 5 } = req.body;

    if (!req.session?.accessToken) {
      return res.status(401).json({ error: 'Access token not available' });
    }

    const driveUseCases = ServiceFactory.createDriveUseCases(req.session.accessToken);
    const result = await driveUseCases.extractAllContent(req.user!.id, batchSize);

    return res.json(result);
  } catch (error) {
    console.error('Error extracting all content:', error);
    return res.status(500).json({ error: 'Failed to extract all content' });
  }
});

export { router as driveRouter };