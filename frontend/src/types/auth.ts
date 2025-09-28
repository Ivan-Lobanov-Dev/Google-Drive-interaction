export interface User {
  id: string
  email: string
  name: string | null
  pictureUrl: string | null
}

export interface AuthResponse {
  authUrl?: string
  user?: User
  success?: boolean
}
