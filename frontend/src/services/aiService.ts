import type { AIAnswer } from '../types/ai'
import { buildApiUrl } from '../config/api'

export class AIService {
  /**
   * Ask a question using the universal AI endpoint
   */
  static async askQuestion(question: string): Promise<AIAnswer> {
    const url = buildApiUrl('/api/ai/rag/query');
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        question: question.trim()
      })
    })
    
    if (!response.ok) {
      let errorMessage = 'Failed to get AI answer'
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
      } catch {
        // If response is not JSON, use status text
        errorMessage = `HTTP ${response.status}: ${response.statusText}`
      }
      throw new Error(errorMessage)
    }

    try {
      return await response.json()
    } catch {
      throw new Error('Invalid JSON response from server')
    }
  }


}
