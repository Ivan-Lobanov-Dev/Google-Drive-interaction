import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { prisma } from '../lib/prisma.js';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string | null;
    pictureUrl: string | null;
  };
  session?: {
    id: string;
    sessionId: string;
    accessToken: string;
    refreshToken: string | null;
    tokenExpiresAt: Date;
  };
}

// Google OAuth2 configuration for token refresh
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Function to refresh access token
const refreshAccessToken = async (refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
} | null> => {
  try {
    oauth2Client.setCredentials({
      refresh_token: refreshToken
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token || !credentials.expiry_date) {
      return null;
    }

    return {
      accessToken: credentials.access_token,
      expiresAt: new Date(credentials.expiry_date)
    };
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const sessionId = req.cookies.sessionId;

    if (!sessionId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const session = await prisma.userSession.findUnique({
      where: { sessionId },
      include: { user: true }
    });

    if (!session) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    // Check if token is expired and try to refresh
    if (session.tokenExpiresAt < new Date()) {
      if (!session.refreshToken) {
        return res.status(401).json({ error: 'Session expired and no refresh token available' });
      }

      // Try to refresh the access token
      const refreshedTokens = await refreshAccessToken(session.refreshToken);
      
      if (!refreshedTokens) {
        // Refresh failed, delete session and require re-authentication
        await prisma.userSession.deleteMany({
          where: { sessionId }
        });
        return res.status(401).json({ error: 'Session expired and refresh failed' });
      }

      // Update session with new tokens
      const updatedSession = await prisma.userSession.update({
        where: { sessionId },
        data: {
          accessToken: refreshedTokens.accessToken,
          tokenExpiresAt: refreshedTokens.expiresAt
        },
        include: { user: true }
      });

      // Update session object for this request
      session.accessToken = updatedSession.accessToken;
      session.tokenExpiresAt = updatedSession.tokenExpiresAt;
    }

    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      pictureUrl: session.user.pictureUrl
    };

    req.session = {
      id: session.id,
      sessionId: session.sessionId,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      tokenExpiresAt: session.tokenExpiresAt
    };

    return next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
};
