<template>
  <div class="home" v-cloak>
    <div class="hero">
      <h2>Welcome to Google Drive Integration</h2>
      
      <!-- Loading state -->
      <div v-if="isCheckingAuth" class="loading">
        <div class="spinner"></div>
        <p>Checking authentication...</p>
      </div>
      
      <!-- Authenticated content -->
      <template v-else>
        <p v-if="!isAuthenticated">Connect your Google Drive account to get started with file management and AI-powered analytics.</p>
        
        <UserAuth 
          :is-authenticated="isAuthenticated"
          @auth-change="handleAuthChange"
        />
        
        <!-- Drive Manager for authenticated users -->
        <div v-if="isAuthenticated" class="authenticated-content">
          <!-- AI Question Interface - only show if files are loaded -->
          <div v-if="hasFiles" class="ai-section">
            <AIQuestionInterface />
          </div>
          
          <DriveManager @files-loaded="handleFilesLoaded" @files-cleared="handleFilesCleared" />
        </div>
        
        <div v-if="!isAuthenticated" class="features">
          <div class="feature">
            <h3>🔐 Secure Authentication</h3>
            <p>Sign in with your Google account using OAuth 2.0</p>
          </div>
          
          <div class="feature">
            <h3>📁 File Management</h3>
            <p>View, search, and manage your Google Drive files</p>
          </div>
          
          <div class="feature">
            <h3>🤖 AI Insights</h3>
            <p>Get AI-powered answers about your files and data</p>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import UserAuth from '../components/UserAuth.vue'
import DriveManager from '../components/DriveManager.vue'
import AIQuestionInterface from '../components/AIQuestionInterface.vue'
import { AuthService } from '../services/authService'

// Authentication state - managed by HomeView
const isAuthenticated = ref<boolean>(false)
const isCheckingAuth = ref<boolean>(true)

// Files state for AI interface visibility
const hasFiles = ref<boolean>(false)

// Check authentication status
const checkAuthStatus = async (): Promise<void> => {
  try {
    isAuthenticated.value = await AuthService.checkAuthStatus()
    } catch {
      isAuthenticated.value = false
    } finally {
    isCheckingAuth.value = false
  }
}

// Handle authentication state changes from UserAuth component
const handleAuthChange = (authenticated: boolean) => {
  isAuthenticated.value = authenticated
  if (!authenticated) {
    hasFiles.value = false // Clear files state when logged out
  }
}

// Handle files loaded event from DriveManager
const handleFilesLoaded = (filesCount: number) => {
  hasFiles.value = filesCount > 0
}

// Handle files cleared event from DriveManager
const handleFilesCleared = () => {
  hasFiles.value = false
}

// Check auth on mount
onMounted(() => {
  checkAuthStatus()
})
</script>

<style scoped>
.home {
  text-align: center;
}

.hero h2 {
  color: #333;
  margin-bottom: 1rem;
  font-size: 2.5rem;
}

.hero p {
  color: #666;
  font-size: 1.2rem;
  margin-bottom: 3rem;
  max-width: 600px;
  margin-left: auto;
  margin-right: auto;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
}

.feature {
  background: #f8f9fa;
  padding: 2rem;
  border-radius: 8px;
  text-align: left;
}

.feature h3 {
  color: #333;
  margin-bottom: 1rem;
  font-size: 1.2rem;
}

.feature p {
  color: #666;
  margin: 0;
  font-size: 1rem;
}

.authenticated-content {
  text-align: left;
  margin-top: 2rem;
  width: 100%;
}

.ai-section {
  margin-top: 3rem;
  padding-top: 2rem;
  border-top: 1px solid #e1e5e9;
}

.authenticated-content h3 {
  color: #333;
  margin-bottom: 1rem;
  font-size: 1.5rem;
}

.authenticated-content > p {
  color: #666;
  font-size: 1.1rem;
  margin-bottom: 2rem;
}

.loading {
  padding: 2rem;
  color: #666;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@media (max-width: 768px) {
  .hero h2 {
    font-size: 2rem;
  }
  
  .hero p {
    font-size: 1rem;
  }
  
  .features {
    grid-template-columns: 1fr;
    gap: 1rem;
  }
}
</style>
