import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { databasePool } from "./config/database.js";
import { authRouter } from "./routes/auth.js";
import { driveRouter } from "./routes/drive.js";
import { aiRouter } from "./routes/ai.js";

dotenv.config();

const app = express();
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Request logging (important only)
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`📡 ${req.method} ${req.path}`);
  }
  next();
});


app.get("/", (req: Request, res: Response) => {
  res.json({ message: "Backend is running" });
});

// Health check endpoint
app.get("/health", async (req: Request, res: Response) => {
  try {
    const client = await databasePool.connect();
    await client.query('SELECT 1');
    client.release();
    res.json({ status: "healthy" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ status: "unhealthy", error: errorMessage });
  }
});

// Auth routes
app.use('/auth', authRouter);

// Drive routes
app.use('/api/drive', driveRouter);

// AI routes
app.use('/api/ai', aiRouter);

const PORT = process.env.PORT || 4000;

// Export app for tests
export { app };

// Start server only if file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
