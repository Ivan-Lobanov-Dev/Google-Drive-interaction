# Google Drive Integration

Allows you to perform CRUD methods on files in Google Drive and obtain statistical data about files 
using  AI Question Interface

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Docker and Docker Compose
- Google Cloud Console project with Drive API enabled

### Installation

1. **Clone the repository**
   ```
   git clone <repository-url>
   cd Google-Drive-interaction
   ```

2. **Install dependencies**
   ```npm install```

3. **Setup environment variables**

   **Main Configuration (.env):**
   ```env
   # Database
   DATABASE_URL=postgresql://username:password@localhost:5432/gdi_db
   PORT=4000
   ```

   **Google OAuth (.env.oauth):**
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id_here
   GOOGLE_CLIENT_SECRET=your_google_client_secret_here
   GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
   ```

   **OpenAI credentials (.env.ai):**
   ```env
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_MAX_TOKENS=1000
   OPENAI_TEMPERATURE=0.1
   ```

4. **Start the databases**
   ```docker compose up -d```

5. **Run database migrations**
   ```cd backend && npx prisma migrate deploy```

6. **Start the application**
   ```npm run dev```

The application will be available at:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## 🧪 Testing

The project includes comprehensive testing with isolated test environment:

```bash
# Setup test database (run once)
cd backend && npm run test:db:setup

# Run all tests
npm test

# Run tests once
npm run test:run

# Run with coverage
npm run test:coverage
```

See [TESTING.md](backend/TESTING.md) for detailed testing documentation.

# 1. Architecture Document:

## End-to-end flow with Data Storage
Google Drive → Extractor → Chunker → Embedder → Vector Store → Retriever → RAG Orchestrator → AI Provider → Answering → Audit Logging

## AI Provider Architecture
The system implements a modular AI provider architecture that allows easy switching between different AI services:

- **AIProvider Interface**: Abstract interface defining contract for all AI services
- **OpenAIAdapter**: Default implementation using OpenAI GPT-4o-mini and embeddings
- **AIService**: Service layer that manages provider switching and fallbacks
- **Extensible Design**: Easy to add Gemini, Claude, or other providers by implementing the AIProvider interface

### Provider Switching Example
```typescript
// Use OpenAI (default)
const aiService = new AIService();

// Switch to Gemini
const aiService = new AIService(new GeminiAdapter());

// Switch to Claude
const aiService = new AIService(new ClaudeAdapter());
```

- **Extractor**  
  - **When:** Runs when syncing Google Drive files or fetching updated content.  
  - **Actions:** Sends API requests to Google Drive to fetch file metadata and content (Docs, Sheets, PDFs, text files).  
  - **Where Data is Stored:**  
    - **Files table (`files_metadata`)** – stores metadata such as `id`, `user_id`, `name`, `owner`, `mime_type`, `size`, `modified_time`, `created_time`, `permissions`, and sets `content_fetched = false` initially. Additional metadata stored in flexible `extra_metadata` JSON field (webViewLink, thumbnailLink, description, starred, trashed, shared, ownedByMe, owners, parents, etc.)
    - **Note:** Each user's files are isolated by `user_id`. Metadata can be aggregated for analytics while respecting user boundaries.

- **Chunker**  
  - **When:** Immediately after file content is retrieved by the Extractor.  
  - **Actions:** Splits the file text into logical chunks (800 characters with 50-character overlap). Uses intelligent break point detection for sentences, paragraphs, and word boundaries to maintain context.  
  - **Where Data is Stored:**  
    - **Chunks table (`file_chunks`)** – stores `id`, `file_id` (FK), `text`, `chunk_index`, and `created_at`.  
    - `embedding` is initially empty and will be populated by the Embedder.
    - **Note:** Access control is enforced through the parent file's `user_id` - only chunks from files belonging to the requesting user are retrieved for AI queries.
    - **Improvements:** Enhanced chunking algorithm prevents duplicate chunks and ensures optimal text segmentation.

- **Embedder**  
  - **When:** After chunks are created.  
  - **Actions:** Generates vector embeddings for each chunk using the OpenAI embeddings API.  
  - **Where Data is Stored:**  
    - Updates **Chunks table (`file_chunks`)** by filling the `embedding` field (currently stored as string, can be migrated to vector type later).

- **Vector Store**  
  - **When:** Immediately after embeddings are generated.  
  - **Actions:** Stores embeddings and associated metadata for fast semantic search.  
  - **Where Data is Stored:**  
    - Could be in **PostgreSQL + pgvector**, **Pinecone**, or **Weaviate**.

- **Retriever**  
  - **When:** When a user makes a query via the front-end AI interface.  
  - **Actions:** Performs semantic search on the vector store, filtering chunks by `user_id` according to ACLs for personal requests.  
  - **Where Data is Accessed:**  
    - Reads from **Chunks table (`file_chunks`)** and **Files table (`files_metadata`)** for metadata and ACL validation.
    - **Note:** Access control is enforced by joining chunks with files_metadata and filtering by `user_id`. For analytics questions, metadata can be aggregated while respecting user boundaries.

- **RAG Orchestrator**  
  - **When:** After Retriever fetches relevant chunks **for content-based queries only**.  
  - **Actions:**  
    - For questions requiring file content (e.g., "Summarize Project Plan.pdf"), it combines only the **chunks the user has access to** (filtered by `user_id`) into a context block and sends it to the AI Provider for answer generation.  
    - For questions based purely on metadata (e.g., "Which of my files is the largest?", "When did I last modify files?"), the RAG step is **skipped**. User-specific metadata from `files_metadata` is used directly to generate the answer.  
  - **Where Data is Accessed:**  
    - **Content queries:** filtered chunks from `file_chunks` joined with `files_metadata` (respecting `user_id` ACLs).  
    - **Metadata queries:** user-specific data from `files_metadata` (filtered by `user_id`; does not expose file content).  

- **AI Provider**  
  - **When:** After RAG Orchestrator prepares the context.  
  - **Actions:**  
    - Receives the question and context from RAG Orchestrator
    - Uses the configured AI provider (OpenAI, Gemini, Claude, etc.) to generate answers
    - Returns structured response with answer, confidence, sources, and reasoning
  - **Provider Management:**  
    - **Default**: OpenAI GPT-4o-mini for questions, text-embedding-3-small for embeddings
    - **Extensible**: Easy switching between providers via AIProvider interface
    - **Fallback**: Automatic fallback to alternative providers if primary fails


- **Answering & Audit Logging**  
  - **When:** After the LLM generates the answer.  
  - **Actions:** Returns synthesized answer to the user. Logs the request for security and audit purposes.  
  - **Where Data is Stored:**  
    - **Audit table (`audit_logs`)** – stores `user_id`, `query`, `response`, `file_ids` (list of files/chunks used), and `created_at`.


## Google Drive Content Extraction:

- **Docs** → export to plain text (`docs.export('text/plain')`)
- **Sheets** → export to CSV → convert to text
- **PDFs** → parse using `pdf-parse` or `pdf.js`
- **Images / non-text files** → by default, can be ignored or store only metadata (`id`, `name`, `owner`, `size`, `mimeType`).  
  - Text chunking and embeddings are **not possible** directly on binary content.  
  - To include images in semantic search, a separate pipeline with a **vision model** (e.g., CLIP embeddings) would be needed, stored in a **separate vector store**.  
- **Incremental updates** → use `modifiedTime` and pagination to update only new or changed files

## Access Rights / ACLs

- Each request to Google Drive is performed using the OAuth token of the specific user.
- During extraction, file permissions are checked and the owner is stored in the metadata.
- The Retriever always filters chunks by `userId` or `owner`, so the user sees only the data they are allowed to access.
- **Metadata aggregation for analytics** (e.g., file counts, largest file, last modified) is safe to expose globally because it does not reveal file content.  
- **Summary:** AI queries that require content respect ACLs; AI queries that use only metadata can provide global answers to all users.


# 2. Data Model / Storage Design:

## Schema for user authentication and sessions

Table name: users

| Column           | Type        | Description                        |
| ---------------- | ----------- | ---------------------------------- |
| id               | UUID (PK)   | Internal user ID                   |
| google_user_id   | string (UK) | Google OAuth user ID               |
| email            | string      | User email address                 |
| name             | string      | User display name (optional)       |
| picture_url      | string      | User profile picture URL (optional)|
| created_at       | timestamp   | Account creation time              |
| updated_at       | timestamp   | Last update time                   |

- **Note:** Index `google_user_id` and `email` for fast user lookups during authentication.

Table name: user_sessions

| Column           | Type        | Description                        |
| ---------------- | ----------- | ---------------------------------- |
| id               | UUID (PK)   | Session ID                         |
| user_id          | UUID (FK)   | Reference to users.id              |
| session_id       | UUID (UK)   | Unique session identifier          |
| access_token     | string      | Google OAuth access token          |
| refresh_token    | string      | Google OAuth refresh token (optional)|
| token_expires_at | timestamp   | Access token expiration time       |
| created_at       | timestamp   | Session creation time              |
| updated_at       | timestamp   | Last session update time           |

- **Note:** Sessions are used to maintain user authentication state and manage OAuth token refresh cycles.

## Schema for storing file metadata and content chunks

Table name: files_metadata

| Column           | Type        | Description                        |
| ---------------- | ----------- | ---------------------------------- |
| id               | string (PK) | Google Drive File ID               |
| user_id          | UUID (FK)   | Reference to users.id              |
| name             | string      | File name                          |
| owner            | string      | Owner email                        |
| mime_type        | string      | File type (Google Docs, PDF, etc.) |
| size             | bigint      | File size in bytes                 |
| modified_time    | timestamp   | Last modification time             |
| created_time     | timestamp   | File creation time                 |
| permissions      | JSON        | ACL info                           |
| content_fetched  | boolean     | Flag if content has been ingested  |
| extra_metadata   | JSON        | Flexible field for future extensions (webViewLink, thumbnailLink, description, starred, trashed, shared, ownedByMe, owners, parents, etc.) |
| created_at       | timestamp   | Record creation time               |
| updated_at       | timestamp   | Record last update time            |

- **Note:** 
  - Unique constraint on `(id, user_id)` - same file can belong to different users
  - Index `user_id`, `owner`, `modified_time`, and `size` for fast queries
  - `extra_metadata` JSON field allows easy addition of new fields without schema changes

Table name: file_chunks

| Column       | Type        | Description             |
| ------------ | ----------- | ----------------------- |
| id           | UUID (PK)   | Chunk ID                |
| file_id      | string (FK) | Parent file ID          |
| text         | text        | Chunk text              |
| embedding    | string      | Vector embedding (can be changed to vector type later) |
| chunk_index  | int         | Chunk order within file |
| created_at   | timestamp   | Creation time           |

Table name: users_request

| Column      | Type      | Description                                     |
| ----------- | --------- | ----------------------------------------------- |
| id          | UUID (PK) | ID                                              |
| user\_id    | string    | User's ID which made request                    |
| query       | text      | User's question                                 |
| response    | text      | AI Response                                     |
| file\_ids   | JSON      | List of files/chunks that were used             |
| created\_at | timestamp | Request time                                    |

Table name: sync_status

| Column         | Type        | Description                        |
| -------------- | ----------- | ---------------------------------- |
| id             | UUID (PK)   | Sync status ID                     |
| user_id        | UUID (FK)   | Reference to users.id (unique)     |
| is_running     | boolean     | Whether sync is currently running  |
| started_at     | timestamp   | When sync started                  |
| completed_at   | timestamp   | When sync completed                |
| error_message  | string      | Error message if sync failed       |
| created_at     | timestamp   | Record creation time               |
| updated_at     | timestamp   | Record last update time            |

- **Note:** One-to-one relationship with users table to track sync status per user


## Vector database

pgvector for PostgreSQL

## Chunking Strategy

- **Chunk size:** 500–1000 tokens  
- **Overlap:** 50 tokens  
- **Incremental updates:** check `modifiedTime` and `content_fetched`

# 3. API Specification:

## Authentication Endpoints

### **GET** /auth/google

Initiates Google OAuth authentication flow.

- **Response:**
```json
{
  "authUrl": "https://accounts.google.com/o/oauth2/v2/auth?client_id=..."
}
```

### **GET** /auth/google/callback

Handles Google OAuth callback after user authorization.

- **Query Parameters:**
  - `code` (string): Authorization code from Google
  - `state` (string, optional): State parameter for security

- **Response:** Redirects to frontend with success parameter
- **Side Effects:**
  - Creates or updates user in database
  - Creates new session with OAuth tokens
  - Sets HTTP-only session cookie

### **GET** /auth/me

Returns current authenticated user information.

- **Authentication:** Required (session cookie)
- **Response:**
```json
{
  "user": {
    "id": "user-uuid",
    "email": "user@example.com",
    "name": "User Name",
    "pictureUrl": "https://example.com/avatar.jpg"
  }
}
```

### **POST** /auth/logout

Logs out current user and invalidates session.

- **Authentication:** Required (session cookie)
- **Response:**
```json
{
  "message": "Logged out successfully"
}
```

## Google Drive API Endpoints

### **GET** /api/drive/files

Get files from database with pagination and filtering.

- **Authentication:** Required (session cookie)
- **Query Parameters:**
  - `page` (number, optional): Page number (default: 1)
  - `limit` (number, optional): Items per page (default: 9)
  - `modifiedAfter` (string, optional): ISO date string
  - `modifiedBefore` (string, optional): ISO date string
  - `mimeType` (string, optional): Filter by MIME type
  - `search` (string, optional): Search in file names
  - `contentFetched` (boolean, optional): Filter by content extraction status

- **Response:**
```json
{
  "files": [
    {
      "id": "file-id",
      "userId": "user-uuid",
      "name": "Document.pdf",
      "owner": "user@example.com",
      "mimeType": "application/pdf",
      "size": "1024000",
      "modifiedTime": "2025-01-15T10:30:00Z",
      "createdTime": "2025-01-10T09:00:00Z",
      "permissions": {...},
      "contentFetched": false,
      "extraMetadata": {
        "webViewLink": "https://drive.google.com/file/d/.../view",
        "thumbnailLink": "https://...",
        "starred": false,
        "shared": true
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "totalCount": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
```

### **GET** /api/drive/files/:id

Get specific file by ID.

- **Authentication:** Required (session cookie)
- **Response:** Single file object (same structure as in files array above)

### **PUT** /api/drive/files/:id

Update file metadata in Google Drive and database.

- **Authentication:** Required (session cookie)
- **Request Body:**
```json
{
  "name": "New File Name.pdf",
  "description": "Updated description"
}
```
- **Response:**
```json
{
  "message": "File updated successfully",
  "file": { /* updated file object */ }
}
```

### **DELETE** /api/drive/files/:id

Delete file from Google Drive and database.

- **Authentication:** Required (session cookie)
- **Response:**
```json
{
  "message": "File deleted successfully"
}
```

### **POST** /api/drive/sync

Smart synchronization with Google Drive - fetches only modified files since last sync.

- **Authentication:** Required (session cookie)
- **Request Body:**
```json
{
  "modifiedAfter": "2025-01-01T00:00:00Z"
}
```
- **Response:**
```json
{
  "message": "Files synchronized successfully",
  "stats": {
    "totalFetched": 25,
    "totalSaved": 15,
    "totalSkipped": 10,
    "contentExtracted": 12,
    "contentFailed": 3,
    "totalDeleted": 2
  }
}
```

**Features:**
- Automatically determines last sync time if `modifiedAfter` not provided
- Includes content extraction statistics
- Handles large file sets with pagination
- Robust error handling for content extraction failures
- **Sync Protection:** Prevents concurrent sync operations for the same user
- **Status Tracking:** Tracks sync progress and handles stuck syncs

**Error Responses:**
- `409 Conflict` - When sync is already in progress
- `500 Internal Server Error` - When sync fails or tracking fails

### **GET** /api/drive/sync/status

Get current sync status for the authenticated user.

- **Authentication:** Required (session cookie)
- **Response:**
```json
{
  "isRunning": false,
  "startedAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:35:00Z",
  "errorMessage": null
}
```

### **POST** /api/drive/sync/reset

Reset sync status for the authenticated user (useful for stuck syncs).

- **Authentication:** Required (session cookie)
- **Response:**
```json
{
  "message": "Sync status reset successfully"
}
```

## AI Question Interface Endpoints

### **POST** `/api/ai/rag/query` ⭐ **UNIVERSAL ENDPOINT**

**Purpose:** Universal endpoint that automatically handles both metadata questions and content-based RAG queries.

**Features:**
- 🔍 **Smart Question Detection:** Automatically determines if question is about metadata or content
- 📊 **Metadata Analysis:** Statistical questions about file properties, sizes, dates, owners  
- 📚 **Content Search:** Semantic search through file content using RAG

- **Authentication:** Required (session cookie)
- **Request Body:**
```json
{
  "question": "Who owns the most files?",
  "filters": {
    "dateRange": {
      "start": "2024-01-01",
      "end": "2024-12-31"
    },
    "fileTypes": ["application/pdf", "text/plain"],
    "owners": ["user@example.com"]
  }
}
```

- **Response (Metadata Question):**
```json
{
  "question": "Who owns the most files?",
  "answer": "Based on your file metadata, you own 95% of the files...",
  "confidence": 0.9,
  "sources": [],
  "reasoning": "Answer generated based on file metadata analysis",
  "type": "metadata",
  "statistics": {
    "totalFiles": 150,
    "totalSize": 2048576000,
    "averageSize": 13657173,
    "fileTypes": {"application/pdf": 45, "text/plain": 30},
    "owners": {"user@example.com": 150}
  },
  "totalFiles": 150,
  "filters": {...},
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

- **Response (Content Question):**
```json
{
  "question": "What documents mention 'project planning'?",
  "answer": "I found 3 documents that mention project planning...",
  "confidence": 0.85,
  "sources": ["doc1.pdf", "meeting_notes.docx"],
  "reasoning": "Based on semantic search through file content",
  "type": "content",
  "context": [
    {
      "fileId": "123",
      "fileName": "doc1.pdf", 
      "chunkIndex": 2,
      "text": "The project planning phase includes..."
    }
  ],
  "totalFiles": 150,
  "totalChunks": 450,
  "filters": {...},
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```


## RAG (Retrieval-Augmented Generation) Endpoints

### **POST** /api/ai/rag/ingest-plan

Returns a plan for ingestion based on file criteria.

- **Authentication:** Required (session cookie)
- **Request Body:**
```json
{
  "fileIds": ["abc123", "def456"],
  "dateRange": {
    "start": "2025-01-01",
    "end": "2025-12-31"
  },
  "fileTypes": ["application/pdf", "text/plain"],
  "owners": ["user@example.com"]
}
```

- **Response:**
```json
{
  "plan": {
    "totalFiles": 150,
    "filesToProcess": 45,
    "alreadyProcessed": 105,
    "estimatedChunks": 450,
    "strategy": "batch",
    "fileTypes": ["application", "text", "image"],
    "estimatedTime": "15 minutes",
    "recommendations": [
      "Consider processing in smaller batches",
      "Large files detected - may take longer"
    ]
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

> **Note:** The `/api/ai/rag/query` endpoint has been moved to the main AI Question Interface section above as the universal endpoint that handles both metadata and content questions.

## AI Provider Architecture

The system uses a modular AI provider architecture that allows easy switching between different AI services:

### **AIProvider Interface**
```typescript
interface AIProvider {
  answerQuestion(context: QuestionContext): Promise<AIResponse>;
  getFileStatistics(files: DriveFileData[]): Promise<FileStatistics>;
}
```


# 4. Security & Access Control:

- **OAuth2 authentication** via Google OAuth 2.0 with refresh token management
- **Session management** using secure HTTP-only cookies with UUID-based session IDs
- **Token refresh** automatically handled when access tokens expire
- **User identification** through `users` table linked to Google OAuth user IDs
- **ACL check** is performed before returning chunks based on user sessions and file ownership
- **Audit logging** stores:
  - who made the request (`userId` from sessions table)
  - timestamp
  - which files/chunks were accessed
  - user query and AI response
- **Metadata analytics**: global queries are safe because they do not expose file content
- **Environment security**: OAuth credentials stored in separate `.env.oauth` file excluded from version control

# 5. Scalability & Performance

- **Batching:** when extracting files and generating embeddings – batch of 50–100 chunks.
- **Parallel embeddings:** use `Promise.all` / worker threads.
- **Caching:** cache embeddings in the vector store and intermediate search results.
- **Monitoring:** log ingestion, errors, execution time, metrics (Prometheus/Grafana).
- **Indexes & optimization**: add indexes on owner, modifiedTime, size for fast aggregation queries used by analytics.
