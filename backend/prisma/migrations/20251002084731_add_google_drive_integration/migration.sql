-- CreateTable
CREATE TABLE "files_metadata" (
    "id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" BIGINT,
    "modified_time" TIMESTAMP(3) NOT NULL,
    "created_time" TIMESTAMP(3) NOT NULL,
    "permissions" JSONB,
    "content_fetched" BOOLEAN NOT NULL DEFAULT false,
    "extra_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_chunks" (
    "id" UUID NOT NULL,
    "file_id" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" TEXT,
    "chunk_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "files_metadata_user_id_idx" ON "files_metadata"("user_id");

-- CreateIndex
CREATE INDEX "files_metadata_owner_idx" ON "files_metadata"("owner");

-- CreateIndex
CREATE INDEX "files_metadata_modified_time_idx" ON "files_metadata"("modified_time");

-- CreateIndex
CREATE INDEX "files_metadata_size_idx" ON "files_metadata"("size");

-- CreateIndex
CREATE UNIQUE INDEX "files_metadata_id_user_id_key" ON "files_metadata"("id", "user_id");

-- AddForeignKey
ALTER TABLE "files_metadata" ADD CONSTRAINT "files_metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files_metadata"("id") ON DELETE CASCADE ON UPDATE CASCADE;
