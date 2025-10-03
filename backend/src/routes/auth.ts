import { Router, Request, Response } from 'express';
import { google } from 'googleapis';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { authenticate, AuthenticatedRequest } from '../middleware/auth.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();
dotenv.config({ path: '.env.oauth', override: true });

const router = Router();

// Google OAuth2 configuration
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Scopes for Google Drive API
const SCOPES = [
  'https://www.googleapis.com/auth/drive', // Full access to Google Drive (read, write, delete)
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

// Generate Google OAuth URL
router.get('/google', (req: Request, res: Response) => {
  try {
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent' // Force consent screen to get refresh token
    });

    res.json({ authUrl });
  } catch (error) {
    console.error('Error generating auth URL:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

// Store used codes to prevent reuse
const usedCodes = new Set<string>();

// Handle Google OAuth callback
router.get('/google/callback', async (req: Request, res: Response) => {
  try {
    const { code } = req.query;

    if (!code || typeof code !== 'string') {
      console.error('No authorization code provided');
      return res.status(400).json({ error: 'Authorization code is required' });
    }

    // Check if code was already used
    if (usedCodes.has(code)) {
      const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=success`;
      return res.redirect(302, frontendUrl);
    }

    // Mark code as used
    usedCodes.add(code);

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get user info from Google
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    if (!userInfo.data.email || !userInfo.data.id) {
      console.error('Missing user information:', userInfo.data);
      return res.status(400).json({ error: 'Failed to get user information' });
    }

    // Check if user exists in database
    let user = await prisma.user.findUnique({
      where: { googleUserId: userInfo.data.id }
    });

    // Create user if doesn't exist
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleUserId: userInfo.data.id,
          email: userInfo.data.email,
          name: userInfo.data.name || null,
          pictureUrl: userInfo.data.picture || null
        }
      });
    }

    // Create session
    const sessionId = uuidv4();
    const tokenExpiresAt = new Date(Date.now() + (tokens.expiry_date || 3600000));

    await prisma.userSession.create({
      data: {
        userId: user.id,
        sessionId,
        accessToken: tokens.access_token || '',
        refreshToken: tokens.refresh_token || null,
        tokenExpiresAt
      }
    });

    // Set session cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    // Redirect to frontend with success message
    const frontendUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}?auth=success`;
    res.redirect(302, frontendUrl);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// Get current user (protected route)
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  res.json({
    user: {
      id: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      pictureUrl: req.user!.pictureUrl
    }
  });
});

// Logout (protected route)
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Delete session from database
    await prisma.userSession.deleteMany({
      where: { sessionId: req.session!.sessionId }
    });

    // Clear session cookie
    res.clearCookie('sessionId');
    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
});

export { router as authRouter };
