# Google-Drive-interaction
Allows you to perform CRUD methods on files in Google Drive and obtain statistical data about files using  AI Question Interface

# 1. Architecture Document:

## End-to-end flow with Data Storage
Google Drive → Extractor → Chunker → Embedder → Vector Store → Retriever → RAG Orchestrator → Answering → Audit Logging

- **Extractor**  
  - **When:** Runs when syncing Google Drive files or fetching updated content.  
  - **Actions:** Sends API requests to Google Drive to fetch file metadata and content (Docs, Sheets, PDFs, text files).  
  - **Where Data is Stored:**  
    - **Files table (`files`)** – stores metadata such as `id`, `name`, `owner`, `mimeType`, `size`, `modifiedTime`, `permissions`, and sets `content_fetched = false` initially. All other metadata we need could be store in `extra_metadata` as JSON
    - **Note:** Metadata from all users can be safely aggregated for analytics queries (e.g., “Who owns the most files?”) without exposing file content.

- **Chunker**  
  - **When:** Immediately after file content is retrieved by the Extractor.  
  - **Actions:** Splits the file text into logical chunks (500–1000 tokens with ~50-token overlap).  
  - **Where Data is Stored:**  
    - **Chunks table (`file_chunks`)** – stores `id`, `file_id` (FK), `text`, `chunk_index`, and `created_at`.  
    - `embedding` is initially empty and will be populated by the Embedder.
    - **Note:** Only chunks that the user has access to (based on `owner` and `permissions`) will be retrieved for AI queries.

- **Embedder**  
  - **When:** After chunks are created.  
  - **Actions:** Generates vector embeddings for each chunk using the OpenAI embeddings API.  
  - **Where Data is Stored:**  
    - Updates **Chunks table (`file_chunks`)** by filling the `embedding` field.

- **Vector Store**  
  - **When:** Immediately after embeddings are generated.  
  - **Actions:** Stores embeddings and associated metadata for fast semantic search.  
  - **Where Data is Stored:**  
    - Could be in **PostgreSQL + pgvector**, **Pinecone**, or **Weaviate**.

- **Retriever**  
  - **When:** When a user makes a query via the front-end AI interface.  
  - **Actions:** Performs semantic search on the vector store, filtering chunks by `userId` or `owner` according to ACLs for personal requests.  
  - **Where Data is Accessed:**  
    - Reads from **Chunks table (`file_chunks`)** and **Files table (`files`)** for metadata and ACL validation.
    - **Note:** For global analytics questions that only require metadata (e.g., “Who owns the most files?”), filtering by `owner` is not applied, allowing all users to see aggregate statistics from `files` safely without exposing content.

- **RAG Orchestrator**  
  - **When:** After Retriever fetches relevant chunks **for content-based queries only**.  
  - **Actions:**  
    - For questions requiring file content (e.g., “Summarize Project Plan.pdf”), it combines only the **chunks the user has access to** into a context block and sends it to the LLM for answer generation.  
    - For questions based purely on metadata (e.g., “Who owns the most files?”, “Which file is the largest?”), the RAG step is **skipped**. Aggregated metadata from `files_metadata` is used directly to generate the answer.  
  - **Where Data is Accessed:**  
    - **Content queries:** filtered chunks from `files_chunks` (respecting ACLs and owner).  
    - **Metadata queries:** aggregated data from `files_metadata` (safe for all users; does not expose file text).  


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

## Schema for storing file metadata and content chunks

Table name: files_metadata

| Column           | Type        | Description                        |
| ---------------- | ----------- | ---------------------------------- |
| id               | string (PK) | Google Drive File ID               |
| name             | string      | File name                          |
| owner            | string      | Owner email                        |
| mimeType         | string      | File type (Google Docs, PDF, etc.) |
| size             | int         | File size in bytes                 |
| modifiedTime     | timestamp   | Last modification time             |
| permissions      | JSON        | ACL info                           |
| content\_fetched | boolean     | Flag if content has been ingested  |
| extra_metadata   | JSON        | Any other relevant data (flexible) |

- **Note:** Index `owner`, `modifiedTime`, and `size` for fast aggregation queries used by AI analytics.

Table name: files_chunks

| Column       | Type        | Description             |
| ------------ | ----------- | ----------------------- |
| id           | UUID (PK)   | Chunk ID                |
| file\_id     | string (FK) | Parent file ID          |
| text         | text        | Chunk text              |
| embedding    | vector      | Vector embedding        |
| chunk\_index | int         | Chunk order within file |
| created\_at  | timestamp   | Creation time           |

Table name: users_request

| Column      | Type      | Description                                     |
| ----------- | --------- | ----------------------------------------------- |
| id          | UUID (PK) | ID                                              |
| user\_id    | string    | User's ID which made request                    |
| query       | text      | User's question                                 |
| response    | text      | AI Response                                     |
| file\_ids   | JSON      | List of files/chunks that were used             |
| created\_at | timestamp | Request time                                    |


## Vector database

pgvector for PostgreSQL

## Chunking Strategy

- **Chunk size:** 500–1000 tokens  
- **Overlap:** 50 tokens  
- **Incremental updates:** check `modifiedTime` and `content_fetched`

# 3. API Specification:

## **POST** /rag/ingest-plan

- Request: 
{
  "fileIds": ["abc123", "def456"],
  "dateRange": {"from": "2025-01-01", "to": "2025-09-01"}
}

- Response: 
{
  "plan": [
    {"fileId": "abc123", "action": "chunk_and_embed"},
    {"fileId": "def456", "action": "skip"}
  ]
}

## **POST** /rag/query

- Request:
{
  "question": "Which file was modified most recently?",
  "filters": {
    "dateRange": {"from": "2025-01-01", "to": "2025-09-01"},
    "owner": "user@example.com",
    "mimeType": ["application/pdf"]
  }
}

-Response:
{
  "answer": "The file 'Project Plan.pdf' was modified most recently on 2025-09-25.",
  "context": ["chunk1 text...", "chunk2 text..."]
}


# 4. Security & Access Control:

- **OAuth2 tokens** are used at the user level.
- **ACL check** is performed before returning chunks.
- **Audit logging** stores:
  - who made the request (`userId`)
  - timestamp
  - which files/chunks were accessed
  - user query and AI response
- **Metadata analytics**: global queries are safe because they do not expose file content.

# 5. Scalability & Performance

- **Batching:** when extracting files and generating embeddings – batch of 50–100 chunks.
- **Parallel embeddings:** use `Promise.all` / worker threads.
- **Caching:** cache embeddings in the vector store and intermediate search results.
- **Monitoring:** log ingestion, errors, execution time, metrics (Prometheus/Grafana).
- **Indexes & optimization**: add indexes on owner, modifiedTime, size for fast aggregation queries used by analytics.
