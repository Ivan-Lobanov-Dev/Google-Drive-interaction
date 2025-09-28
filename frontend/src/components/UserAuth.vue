<template>
  <div class="auth-container">
    <div v-if="!props.isAuthenticated" class="login-section">
      <button @click="handleLogin" class="login-btn" :disabled="loading">
        <span v-if="loading">Signing in...</span>
        <span v-else>Sign in with Google</span>
      </button>
    </div>

    <div v-else class="user-section">
      <!-- Loading state for user data -->
      <div v-if="!userDataLoaded" class="user-loading">
        <div class="spinner"></div>
        <p>Loading user data...</p>
      </div>
      
      <!-- User data when loaded -->
      <template v-else>
        <div class="user-info">
          <img 
            v-if="user?.pictureUrl && !imageError" 
            :src="user.pictureUrl" 
            :alt="user.name" 
            class="user-avatar"
            @error="handleImageError"
          />
          <div v-else class="user-avatar-placeholder">
            {{ user?.name?.charAt(0) || 'U' }}
          </div>
          <div class="user-details">
            <h3>{{ user?.name || 'User' }}</h3>
            <p>{{ user?.email }}</p>
          </div>
        </div>
        <button @click="handleLogout" class="logout-btn" :disabled="loading">
          <span v-if="loading">Signing out...</span>
          <span v-else>Sign out</span>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { AuthService } from '../services/authService'
import type { User } from '../types/auth'

interface Props {
  isAuthenticated: boolean
}

// Props and emits
const props = defineProps<Props>()
const emit = defineEmits<{
  'auth-change': [authenticated: boolean]
}>()

// State
const loading = ref<boolean>(false)
const imageError = ref<boolean>(false)
const user = ref<User | null>(null)
const userDataLoaded = ref<boolean>(false)

// Event handlers
const handleImageError = (): void => {
  imageError.value = true
}

// API functions using service
const getUserData = async (): Promise<void> => {
  userDataLoaded.value = false
  
  const userData = await AuthService.getUserData()
  
  if (userData) {
    user.value = userData
  } else {
    user.value = null
    emit('auth-change', false)
  }
  
  userDataLoaded.value = true
}

const handleLogin = async (): Promise<void> => {
  try {
    loading.value = true
    await AuthService.login()
  } catch (error) {
    console.error('Login failed:', error)
  } finally {
    loading.value = false
  }
}

const handleLogout = async (): Promise<void> => {
  try {
    loading.value = true
    
    const success = await AuthService.logout()
    
    if (success) {
      user.value = null
      emit('auth-change', false)
    }
  } catch (error) {
    console.error('Logout failed:', error)
  } finally {
    loading.value = false
  }
}

// Watchers
// When user becomes authenticated, fetch their data
// When user logs out, clear user data and hide loading state
watch(() => props.isAuthenticated, (newValue: boolean) => {
  if (newValue) {
    getUserData()
  } else {
    user.value = null
    userDataLoaded.value = true
  }
})

// Lifecycle
// Component initialization and OAuth callback handling
onMounted((): void => {
  // If user is already authenticated on mount, fetch their data
  if (props.isAuthenticated) {
    getUserData()
  }
  
  // Handle OAuth callback redirect from Google
  if (AuthService.isOAuthCallback()) {
    // Clean up URL by removing query parameters
    AuthService.cleanupOAuthUrl()
    // Fetch user data after successful OAuth authentication
    getUserData()
  }
})
</script>

<style scoped>
.auth-container {
  max-width: 400px;
  margin: 0 auto;
  padding: 2rem;
  text-align: center;
}

.login-section {
  text-align: center;
  margin-bottom: 2rem;
}

.login-btn, .logout-btn {
  background: #4285f4;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-size: 16px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.login-btn:hover:not(:disabled) {
  background: #3367d6;
}

.logout-btn {
  background: #dc3545;
  margin-top: 1rem;
}

.logout-btn:hover:not(:disabled) {
  background: #c82333;
}

.login-btn:disabled, .logout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.user-section {
  text-align: left;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  margin-bottom: 1rem;
}

.user-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-right: 1rem;
}

.user-avatar-placeholder {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  margin-right: 1rem;
  background: #4285f4;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
}

.user-details h3 {
  margin: 0 0 0.25rem 0;
  color: #333;
}

.user-details p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.user-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  color: #666;
}

.user-loading .spinner {
  width: 30px;
  height: 30px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #4285f4;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>
