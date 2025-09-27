-- This script runs when PostgreSQL container starts for the first time
-- It ensures the database is properly initialized

-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Display success message
DO $$
BEGIN
    RAISE NOTICE 'Database gdi_db initialized with pgvector extension';
END $$;
