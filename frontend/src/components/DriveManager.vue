<template>
  <div class="drive-manager">
    <div class="drive-header">
      <h2>Google Drive Files</h2>
      <div class="drive-actions">
        <button 
          @click="syncFiles" 
          class="btn btn-primary"
          :disabled="loading.sync"
        >
          <span v-if="loading.sync">Syncing...</span>
          <span v-else>Sync Files</span>
        </button>
      </div>
    </div>

    <!-- Filters -->
    <div class="drive-filters">
      <div class="filter-row">
        <input
          v-model="filters.search"
          @input="debouncedSearch"
          type="text"
          placeholder="Search files..."
          class="search-input"
        />
        <select v-model="filters.mimeType" @change="loadFiles" class="filter-select">
          <option value="">All Types</option>
          <option value="application/pdf">PDF</option>
          <option value="application/vnd.google-apps.document">Google Docs</option>
          <option value="application/vnd.google-apps.spreadsheet">Google Sheets</option>
          <option value="application/vnd.google-apps.presentation">Google Slides</option>
          <option value="image/jpeg,image/png">Images</option>
        </select>
      </div>
    </div>

    <!-- Stats -->
    <div v-if="lastOperation" class="operation-stats">
      <div class="stats-card">
        <button class="close-btn" @click="closeOperationStats" title="Close">
          ×
        </button>
        <h4>{{ lastOperation.type }}</h4>
        <p>{{ lastOperation.message }}</p>
        <div class="stats-details" v-if="lastOperation.stats">
          <span>Fetched: {{ lastOperation.stats.totalFetched }}</span>
          <span>Saved: {{ lastOperation.stats.totalSaved }}</span>
          <span>Skipped: {{ lastOperation.stats.totalSkipped }}</span>
          <span v-if="lastOperation.stats.totalDeleted !== undefined && lastOperation.stats.totalDeleted > 0" class="deleted-stat">
            Deleted: {{ lastOperation.stats.totalDeleted }}
          </span>
          <span v-if="lastOperation.stats.contentExtracted !== undefined">
            Content Extracted: {{ lastOperation.stats.contentExtracted }}
          </span>
          <span v-if="lastOperation.stats.contentFailed !== undefined && lastOperation.stats.contentFailed > 0" class="error-stat">
            Content Failed: {{ lastOperation.stats.contentFailed }}
          </span>
        </div>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-message">
      {{ error }}
      <button @click="error = null" class="error-close">×</button>
    </div>

    <!-- Files List -->
    <div class="files-container">
      <div v-if="loading.files" class="loading-state">
        <div class="spinner"></div>
        <p>Loading files...</p>
      </div>

      <div v-else-if="files.length === 0" class="empty-state">
        <p>No files found. Click "Sync Files" to load files from Google Drive.</p>
      </div>

      <div v-else class="files-grid">
        <div
          v-for="file in files"
          :key="file.id"
          class="file-card"
          :class="{ 'file-starred': file.extraMetadata?.starred }"
        >
          <div class="file-icon">
            {{ DriveService.getFileIcon(file.mimeType) }}
          </div>
          
          <div class="file-info">
            <h3 class="file-name" :title="file.name">{{ file.name }}</h3>
            <p class="file-details">
              <span class="file-size">{{ DriveService.formatFileSize(file.size) }}</span>
              <span class="file-date">{{ DriveService.formatDate(file.modifiedTime) }}</span>
            </p>
            <p class="file-owner">{{ file.owner }}</p>
          </div>

          <div class="file-actions">
            <button
              v-if="file.extraMetadata?.webViewLink"
              @click="openFile(file.extraMetadata.webViewLink)"
              class="action-btn view-btn"
              title="View file"
            >
              👁️
            </button>
            <button
              v-if="DriveService.canExtractContent(file.mimeType)"
              @click="extractFileContent(file)"
              class="action-btn extract-btn"
              :title="file.contentFetched ? 'Re-extract content' : 'Extract content'"
              :disabled="loading.extract === file.id"
            >
              <span v-if="loading.extract === file.id">⏳</span>
              <span v-else-if="file.contentFetched">🔄</span>
              <span v-else>📝</span>
            </button>
            <button
              @click="editFile(file)"
              class="action-btn edit-btn"
              title="Edit file"
            >
              ✏️
            </button>
            <button
              @click="deleteFile(file)"
              class="action-btn delete-btn"
              title="Delete file"
              :disabled="loading.delete === file.id"
            >
              <span v-if="loading.delete === file.id">⏳</span>
              <span v-else>🗑️</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Pagination -->
      <div v-if="pagination && pagination.totalPages > 1" class="pagination">
        <button
          @click="changePage(pagination.page - 1)"
          :disabled="!pagination.hasPrev || loading.files"
          class="pagination-btn"
        >
          ← Previous
        </button>
        
        <!-- Page Numbers -->
        <div class="pagination-pages">
          <button
            v-for="page in getVisiblePages()"
            :key="page"
            @click="changePage(page)"
            :class="['pagination-page', { active: page === pagination.page }]"
            :disabled="loading.files"
          >
            {{ page }}
          </button>
        </div>
        
        <button
          @click="changePage(pagination.page + 1)"
          :disabled="!pagination.hasNext || loading.files"
          class="pagination-btn"
        >
          Next →
        </button>
        
        <span class="pagination-info">
          Showing {{ (pagination.page - 1) * pagination.limit + 1 }}-{{ Math.min(pagination.page * pagination.limit, pagination.totalCount) }} 
          of {{ pagination.totalCount }} files
        </span>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editingFile" class="modal-overlay" @click="closeEditModal">
      <div class="modal" @click.stop>
        <div class="modal-header">
          <h3>Edit File</h3>
          <button @click="closeEditModal" class="modal-close">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label for="fileName">File Name:</label>
            <input
              id="fileName"
              v-model="editForm.name"
              type="text"
              class="form-input"
            />
          </div>
          <div class="form-group">
            <label for="fileDescription">Description:</label>
            <textarea
              id="fileDescription"
              v-model="editForm.description"
              class="form-textarea"
              rows="3"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeEditModal" class="btn btn-outline">Cancel</button>
          <button 
            @click="saveFileChanges" 
            class="btn btn-primary"
            :disabled="loading.update"
          >
            <span v-if="loading.update">Saving...</span>
            <span v-else>Save</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { DriveService } from '../services/driveService'
import type { DriveFile, DriveFilesFilters } from '../types/drive'

// Emits
const emit = defineEmits<{
  'files-loaded': [filesCount: number]
  'files-cleared': []
}>()

// State
const files = ref<DriveFile[]>([])
const pagination = ref<{
  page: number
  limit: number
  totalCount: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
} | null>(null)
const error = ref<string | null>(null)
const editingFile = ref<DriveFile | null>(null)
const lastOperation = ref<{ type: string; message: string; timestamp: number } | null>(null)

// Loading states
const loading = reactive({
  files: false,
  sync: false,
  delete: null as string | null,
  update: false,
  extract: null as string | null
})

// Filters
const filters = reactive<DriveFilesFilters>({
  page: 1,
  limit: 9,
  search: '',
  mimeType: ''
})

// Edit form
const editForm = reactive({
  name: '',
  description: ''
})

// Debounced search
let searchTimeout: NodeJS.Timeout
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    filters.page = 1
    loadFiles()
  }, 500)
}

// Methods
const loadFiles = async () => {
  try {
    loading.files = true
    error.value = null
    
    const response = await DriveService.getFiles(filters)
    files.value = response.files
    pagination.value = response.pagination
    
    // Emit files loaded event
    emit('files-loaded', files.value.length)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load files'
    // Emit files cleared event on error
    emit('files-cleared')
  } finally {
    loading.files = false
  }
}

const syncFiles = async () => {
  try {
    loading.sync = true
    error.value = null
    
    const response = await DriveService.syncFiles()
    lastOperation.value = {
      type: 'Sync Files',
      message: response.message,
      stats: response.stats
    }
    
    // Refresh the files list after sync
    await loadFiles()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to sync files'
  } finally {
    loading.sync = false
  }
}

const closeOperationStats = () => {
  lastOperation.value = null
}

const changePage = (page: number) => {
  filters.page = page
  loadFiles()
}

const getVisiblePages = (): number[] => {
  if (!pagination.value) return []
  
  const { page, totalPages } = pagination.value
  const maxVisible = 5 // Show max 5 page numbers
  const pages: number[] = []
  
  if (totalPages <= maxVisible) {
    // Show all pages if total is small
    for (let i = 1; i <= totalPages; i++) {
      pages.push(i)
    }
  } else {
    // Show smart pagination with ellipsis
    const half = Math.floor(maxVisible / 2)
    let start = Math.max(1, page - half)
    let end = Math.min(totalPages, start + maxVisible - 1)
    
    // Adjust start if we're near the end
    if (end - start < maxVisible - 1) {
      start = Math.max(1, end - maxVisible + 1)
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
  }
  
  return pages
}

const openFile = (url?: string) => {
  if (url) {
    window.open(url, '_blank')
  }
}

const editFile = (file: DriveFile) => {
  editingFile.value = file
  editForm.name = file.name
  editForm.description = file.extraMetadata?.description || ''
}

const closeEditModal = () => {
  editingFile.value = null
  editForm.name = ''
  editForm.description = ''
}

const saveFileChanges = async () => {
  if (!editingFile.value) return
  
  try {
    loading.update = true
    error.value = null
    
    await DriveService.updateFile(editingFile.value.id, {
      name: editForm.name,
      description: editForm.description
    })
    
    closeEditModal()
    await loadFiles()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to update file'
  } finally {
    loading.update = false
  }
}

const deleteFile = async (file: DriveFile) => {
  if (!confirm(`Are you sure you want to delete "${file.name}"?`)) {
    return
  }
  
  try {
    loading.delete = file.id
    error.value = null
    
    await DriveService.deleteFile(file.id)
    await loadFiles()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete file'
  } finally {
    loading.delete = null
  }
}


const extractFileContent = async (file: DriveFile) => {
  try {
    loading.extract = file.id
    error.value = null
    
    const response = await DriveService.extractFileContent(file.id)
    
    // Update the file in the list
    const fileIndex = files.value.findIndex(f => f.id === file.id)
    if (fileIndex !== -1) {
      files.value[fileIndex].contentFetched = true
    }
    
    lastOperation.value = {
      type: 'Extract Content',
      message: `${response.message} (${response.chunksCount} chunks created)`,
      file: file.name
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to extract file content'
  } finally {
    loading.extract = null
  }
}


// Lifecycle
onMounted(() => {
  loadFiles()
})
</script>

<style scoped>
.drive-manager {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem;
}

.drive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.drive-header h2 {
  margin: 0;
  color: #333;
}

.drive-actions {
  display: flex;
  gap: 1rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background: #4285f4;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #3367d6;
}

.btn-secondary {
  background: #34a853;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #2d8f47;
}

.btn-outline {
  background: transparent;
  color: #4285f4;
  border: 1px solid #4285f4;
}

.btn-outline:hover:not(:disabled) {
  background: #4285f4;
  color: white;
}

.btn-success {
  background: #28a745;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background: #218838;
}

.drive-filters {
  margin-bottom: 2rem;
}

.filter-row {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.search-input,
.filter-select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input {
  flex: 1;
  max-width: 300px;
}

.operation-stats {
  margin-bottom: 2rem;
}

.stats-card {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
  padding: 1rem;
  position: relative;
}

.close-btn {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  color: #6c757d;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background-color: #e9ecef;
  color: #495057;
}

.close-btn:active {
  transform: scale(0.95);
}

.stats-card h4 {
  margin: 0 0 0.5rem 0;
  color: #28a745;
  padding-right: 2rem; /* Make space for close button */
}

.stats-card p {
  margin: 0 0 0.5rem 0;
}

.stats-details {
  display: flex;
  gap: 1rem;
  font-size: 14px;
  color: #666;
  flex-wrap: wrap;
}

.error-stat {
  color: #dc3545 !important;
  font-weight: 500;
}

.deleted-stat {
  color: #6c757d !important;
  font-weight: 500;
}

.error-message {
  background: #f8d7da;
  color: #721c24;
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.error-close {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: #721c24;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.files-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.file-card {
  background: white;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 1rem;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.file-card:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  border-color: #4285f4;
}

.file-starred {
  border-color: #fbbc04;
}

.file-icon {
  font-size: 2rem;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  margin: 0 0 0.5rem 0;
  font-size: 16px;
  font-weight: 500;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-details {
  margin: 0 0 0.25rem 0;
  font-size: 12px;
  color: #666;
  display: flex;
  gap: 1rem;
}

.file-owner {
  margin: 0;
  font-size: 12px;
  color: #888;
}

.file-actions {
  display: flex;
  gap: 0.5rem;
  flex-shrink: 0;
}

.action-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  transition: background-color 0.2s;
}

.action-btn:hover:not(:disabled) {
  background: #f1f3f4;
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  margin-top: 2rem;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
}

.pagination-pages {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.pagination-btn, .pagination-page {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  min-width: 40px;
  text-align: center;
}

.pagination-btn:hover:not(:disabled),
.pagination-page:hover:not(:disabled) {
  background: #f8f9fa;
  border-color: #4285f4;
}

.pagination-btn:disabled,
.pagination-page:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.pagination-page.active {
  background: #4285f4;
  color: white;
  border-color: #4285f4;
}

.pagination-page.active:hover {
  background: #3367d6;
  border-color: #3367d6;
}

.pagination-info {
  font-size: 14px;
  color: #666;
  text-align: center;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #e1e5e9;
}

.modal-header h3 {
  margin: 0;
}

.modal-close {
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #666;
}

.modal-body {
  padding: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
}

.form-input,
.form-textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #4285f4;
  box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.2);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 1rem;
  border-top: 1px solid #e1e5e9;
}
</style>
