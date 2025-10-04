<template>
  <div class="ai-question-interface">
    <div class="header">
      <h2>🤖 AI Question Interface</h2>
      <p>Ask questions about your Google Drive files and get AI-powered insights</p>
    </div>

    <!-- Question Input -->
    <div class="question-input-container">
      <div class="search-box">
        <input
          v-model="currentQuestion"
          type="text"
          placeholder="Ask a question about your files... (e.g., 'Who owns the most files?')"
          @keyup.enter="askQuestion"
          :disabled="isLoading"
          class="question-input"
        />
        <button
          @click="askQuestion"
          :disabled="isLoading || !currentQuestion.trim()"
          class="ask-button"
        >
          <span v-if="isLoading">⏳</span>
          <span v-else>Ask</span>
        </button>
      </div>
    </div>

    <!-- Suggested Questions -->
    <div v-if="suggestions.length > 0 && !currentAnswer" class="suggestions">
      <h3>💡 Suggested Questions:</h3>
      <div class="suggestion-chips">
        <button
          v-for="suggestion in suggestions"
          :key="suggestion"
          @click="selectSuggestion(suggestion)"
          class="suggestion-chip"
          :disabled="isLoading"
        >
          {{ suggestion }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Analyzing your files and generating an answer...</p>
    </div>

    <!-- Answer Display -->
    <div v-if="currentAnswer && !isLoading" class="answer-container">
      <div class="question-display">
        <strong>❓ Question:</strong> {{ currentAnswer.question }}
      </div>
      
      <div class="answer-display">
        <!-- Main Answer - Prominently Displayed -->
        <div class="main-answer">
          <div class="answer-header">
            <strong>🤖 AI Answer:</strong>
            <span class="confidence-badge" :class="getConfidenceClass(currentAnswer.confidence)">
              {{ Math.round(currentAnswer.confidence * 100) }}% confidence
            </span>
          </div>
          <div class="answer-content">
            {{ getCleanAnswer(currentAnswer.answer) }}
          </div>
          
          <div class="answer-meta">
            <small>
              Based on {{ currentAnswer.totalFiles }} files (metadata only) • 
              {{ formatTimestamp(currentAnswer.timestamp) }}
            </small>
          </div>
        </div>

        <!-- Detailed Information - Collapsible -->
        <details class="answer-details">
          <summary class="details-summary">
            <span>📋 View Detailed Response</span>
          </summary>
          
          <div class="details-content">

            <div v-if="currentAnswer.sources && currentAnswer.sources.length > 0" class="sources">
              <details class="sources-details">
                <summary class="sources-summary">
                  <span class="sources-title">📁 Sources ({{ currentAnswer.sources.length }})</span>
                </summary>
                <ul class="sources-list">
                  <li v-for="source in currentAnswer.sources" :key="source">{{ source }}</li>
                </ul>
              </details>
            </div>

            <div v-if="currentAnswer.reasoning" class="reasoning">
              <h4>🧠 AI Reasoning</h4>
              <p>{{ currentAnswer.reasoning }}</p>
            </div>
            
            <div v-if="currentAnswer.statistics" class="statistics">
              <h4>📊 Statistics</h4>
              <div class="stats-grid">
                <div class="stat-item">
                  <span class="stat-label">Total Files:</span>
                  <span class="stat-value">{{ currentAnswer.statistics.totalFiles }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Total Size:</span>
                  <span class="stat-value">{{ formatBytes(currentAnswer.statistics.totalSize) }}</span>
                </div>
                <div class="stat-item">
                  <span class="stat-label">Average Size:</span>
                  <span class="stat-value">{{ formatBytes(currentAnswer.statistics.averageSize) }}</span>
                </div>
              </div>
              
              <div v-if="currentAnswer.statistics.fileTypes" class="file-types">
                <h5>File Types</h5>
                <div class="file-types-grid">
                  <div v-for="(count, type) in currentAnswer.statistics.fileTypes" :key="type" class="file-type-item">
                    <span class="file-type-name">{{ type }}</span>
                    <span class="file-type-count">{{ count }}</span>
                  </div>
                </div>
              </div>
              
              <div v-if="currentAnswer.statistics.owners" class="owners">
                <h5>File Owners</h5>
                <div class="owners-grid">
                  <div v-for="(count, owner) in currentAnswer.statistics.owners" :key="owner" class="owner-item">
                    <span class="owner-name">{{ owner }}</span>
                    <span class="owner-count">{{ count }} files</span>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="raw-json">
              <h4>🔍 Raw JSON Response</h4>
              <pre class="json-content">{{ JSON.stringify(currentAnswer, null, 2) }}</pre>
            </div>
          </div>
        </details>
      </div>
    </div>

    <!-- Error Display -->
    <div v-if="error" class="error-container">
      <div class="error-message">
        <strong>❌ Error:</strong> {{ error }}
      </div>
      <button 
        @click="retryAfterError" 
        :disabled="isRetryDisabled"
        class="retry-button"
      >
        {{ retryButtonText }}
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { AIService } from '../services/aiService'
import type { AIAnswer } from '../types/ai'

// Suggested questions (metadata only)
const questionSuggestions = [
  "Who owns the most files?",
  "Which file was modified most recently?",
  "What is the average number of files per owner?",
  "Which file is the largest?",
  "What is the distribution of files by their last modified date?"
]

const currentQuestion = ref('')
const currentAnswer = ref<AIAnswer | null>(null)
const suggestions = ref<string[]>([])
const isLoading = ref(false)
const error = ref('')
const retryCountdown = ref(0)
const retryTimer = ref<NodeJS.Timeout | null>(null)

const askQuestion = async () => {
  if (!currentQuestion.value.trim() || isLoading.value) return

  isLoading.value = true
  error.value = ''
  currentAnswer.value = null

  try {
    const data = await AIService.askQuestion(currentQuestion.value.trim())
    currentAnswer.value = data
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred'
    
    // Check if it's an authentication error
    if (errorMessage.includes('401') || errorMessage.includes('Authentication')) {
      error.value = 'Please log in to use AI features'
    } else if (errorMessage.includes('temporarily busy') || errorMessage.includes('Rate limit') || errorMessage.includes('429')) {
      // Use the detailed error message from backend which includes retry timing
      error.value = errorMessage
    } else {
      error.value = errorMessage
    }
  } finally {
    isLoading.value = false
  }
}

const selectSuggestion = (suggestion: string) => {
  currentQuestion.value = suggestion
  askQuestion()
}


const isRetryDisabled = computed(() => retryCountdown.value > 0 || isLoading.value)

const retryButtonText = computed(() => {
  if (retryCountdown.value > 0) {
    return `Wait ${retryCountdown.value}s`
  }
  return 'Try Again'
})

const retryAfterError = async () => {
  if (isRetryDisabled.value) return
  
  // Check if error contains retry timing information
  const waitMatch = error.value.match(/Wait approximately (\d+) seconds/)
  if (waitMatch) {
    const waitTime = parseInt(waitMatch[1])
    startRetryCountdown(waitTime)
  } else {
    // Default retry immediately for non-rate-limit errors
    await askQuestion()
  }
}

const startRetryCountdown = (seconds: number) => {
  retryCountdown.value = seconds
  
  retryTimer.value = setInterval(() => {
    retryCountdown.value--
    
    if (retryCountdown.value <= 0) {
      if (retryTimer.value) {
        clearInterval(retryTimer.value)
        retryTimer.value = null
      }
      // Automatically retry after countdown
      askQuestion()
    }
  }, 1000)
}

const getConfidenceClass = (confidence: number) => {
  if (confidence >= 0.8) return 'high-confidence'
  if (confidence >= 0.6) return 'medium-confidence'
  return 'low-confidence'
}

const formatTimestamp = (timestamp: string) => {
  return new Date(timestamp).toLocaleString()
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

// Alias for consistency
const formatBytes = formatFileSize

const getCleanAnswer = (answer: string) => {
  // Check if the answer is a JSON string wrapped in ```json blocks
  if (answer.includes('```json') && answer.includes('```')) {
    try {
      // Extract JSON from markdown code block
      const jsonMatch = answer.match(/```json\s*([\s\S]*?)\s*```/)
      if (jsonMatch && jsonMatch[1]) {
        const jsonStr = jsonMatch[1].trim()
        const parsed = JSON.parse(jsonStr)
        return parsed.answer || answer
      }
    } catch (error) {
      // If JSON parsing fails, return original answer
      console.warn('Failed to parse JSON answer:', error)
    }
  }
  
  // Check if the answer is plain JSON (without markdown)
  if (answer.startsWith('{') && answer.endsWith('}')) {
    try {
      const parsed = JSON.parse(answer)
      return parsed.answer || answer
    } catch (error) {
      // If JSON parsing fails, return original answer
      console.warn('Failed to parse JSON answer:', error)
    }
  }
  
  // Return original answer if it's not JSON
  return answer
}

const loadSuggestions = () => {
  // Use static suggestions for metadata-only questions
  suggestions.value = [...questionSuggestions]
}


onMounted(() => {
  loadSuggestions()
})
</script>

<style scoped>
.ai-question-interface {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}


.header {
  text-align: center;
  margin-bottom: 30px;
}

.header h2 {
  margin: 0 0 10px 0;
  color: #333;
  font-size: 2rem;
}

.header p {
  color: #666;
  margin: 0;
}

.question-input-container {
  margin-bottom: 30px;
}

.search-box {
  display: flex;
  gap: 10px;
  max-width: 600px;
  margin: 0 auto;
}

.question-input {
  flex: 1;
  padding: 12px 16px;
  border: 2px solid #e1e5e9;
  border-radius: 24px;
  font-size: 16px;
  outline: none;
  transition: border-color 0.2s;
}

.question-input:focus {
  border-color: #4285f4;
}

.question-input:disabled {
  background-color: #f5f5f5;
  cursor: not-allowed;
}

.ask-button {
  padding: 12px 24px;
  background-color: #4285f4;
  color: white;
  border: none;
  border-radius: 24px;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.ask-button:hover:not(:disabled) {
  background-color: #3367d6;
}

.ask-button:disabled {
  background-color: #ccc;
  cursor: not-allowed;
}

.suggestions {
  margin-bottom: 30px;
}

.suggestions h3 {
  margin: 0 0 15px 0;
  color: #333;
  font-size: 1.2rem;
}

.suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.suggestion-chip {
  padding: 8px 16px;
  background-color: #f8f9fa;
  border: 1px solid #e1e5e9;
  border-radius: 16px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.suggestion-chip:hover:not(:disabled) {
  background-color: #e8f0fe;
  border-color: #4285f4;
}

.suggestion-chip:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.loading-state {
  text-align: center;
  padding: 40px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.answer-container {
  background-color: #f8f9fa;
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 30px;
}

.question-display {
  margin-bottom: 15px;
  padding-bottom: 15px;
  border-bottom: 1px solid #e1e5e9;
  color: #333;
}

.answer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.answer-content {
  background-color: white;
  padding: 15px;
  border-radius: 8px;
  margin-bottom: 15px;
  line-height: 1.6;
  color: #333;
}

.confidence-badge {
  padding: 4px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
}

.high-confidence {
  background-color: #d4edda;
  color: #155724;
}

.medium-confidence {
  background-color: #fff3cd;
  color: #856404;
}

.low-confidence {
  background-color: #f8d7da;
  color: #721c24;
}

.sources {
  margin-bottom: 15px;
}

.sources ul {
  margin: 8px 0 0 0;
  padding-left: 20px;
}

.sources li {
  margin-bottom: 4px;
  color: #666;
}

.reasoning {
  margin-bottom: 15px;
}

.reasoning summary {
  cursor: pointer;
  color: #4285f4;
  font-weight: 500;
}

.reasoning p {
  margin: 10px 0 0 0;
  color: #666;
  font-style: italic;
}

.answer-meta {
  color: #999;
  font-size: 12px;
}

/* Main Answer Styles */
.main-answer {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 16px;
}

.main-answer .answer-content {
  font-size: 16px;
  line-height: 1.6;
  margin: 12px 0;
  color: #333;
  font-weight: 500;
}

/* Details Section */
.answer-details {
  border: 1px solid #dee2e6;
  border-radius: 6px;
  margin-top: 16px;
}

.details-summary {
  padding: 12px 16px;
  background: #f8f9fa;
  border-bottom: 1px solid #dee2e6;
  cursor: pointer;
  font-weight: 500;
  color: #495057;
  transition: background-color 0.2s;
}

.details-summary:hover {
  background: #e9ecef;
}

.details-content {
  padding: 16px;
}

.details-content h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.details-content h5 {
  margin: 12px 0 8px 0;
  font-size: 13px;
  font-weight: 600;
  color: #6c757d;
}

/* Statistics Styles */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 13px;
}

.stat-label {
  color: #495057;
}

.stat-value {
  font-weight: 600;
  color: #007bff;
}

.file-types-grid, .owners-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 8px;
}

.file-type-item, .owner-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 10px;
  background: #f8f9fa;
  border-radius: 4px;
  font-size: 13px;
}

.file-type-name, .owner-name {
  color: #495057;
}

.file-type-count, .owner-count {
  font-weight: 600;
  color: #007bff;
}

/* Sources Details */
.sources-details {
  margin-bottom: 16px;
}

.sources-summary {
  cursor: pointer;
  padding: 8px 0;
  border-bottom: 1px solid #e9ecef;
  transition: background-color 0.2s;
}

.sources-summary:hover {
  background: #f8f9fa;
  border-radius: 4px;
  padding: 8px 12px;
}

.sources-title {
  font-size: 14px;
  font-weight: 600;
  color: #495057;
}

.sources-list {
  margin: 12px 0 0 0;
  padding-left: 20px;
  max-height: 200px;
  overflow-y: auto;
}

.sources-list li {
  margin-bottom: 6px;
  color: #666;
  font-size: 13px;
  line-height: 1.4;
}

/* Raw JSON Styles */
.raw-json {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid #dee2e6;
}

.json-content {
  background: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 4px;
  padding: 12px;
  font-size: 12px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}

.error-container {
  background-color: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 20px;
}

.error-message {
  color: #721c24;
  margin-bottom: 10px;
}

.retry-button {
  background-color: #dc3545;
  color: white;
  border: none;
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
}

.retry-button:hover:not(:disabled) {
  background-color: #c82333;
}

.retry-button:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

.statistics-section {
  margin-top: 30px;
}

.statistics-section h3 {
  margin: 0 0 20px 0;
  color: #333;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}

.stat-card {
  background-color: white;
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
}

.stat-value {
  font-weight: bold;
  color: #4285f4;
  margin-bottom: 5px;
}

.stat-label {
  color: #666;
}

@media (max-width: 600px) {
  .search-box {
    flex-direction: column;
  }
  
  .ask-button {
    width: 100%;
  }
  
  .suggestion-chips {
    justify-content: center;
  }
}
</style>
