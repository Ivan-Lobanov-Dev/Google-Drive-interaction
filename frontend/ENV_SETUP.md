# Environment Setup

## Frontend Environment Variables

Create a `.env` file in the `frontend/` directory with the following variables:

```bash
# API Configuration
VITE_API_BASE_URL=http://localhost:4000
```

## Backend Environment Variables

The backend uses the existing `.env` file in the `backend/` directory.

## Development vs Production

- **Development**: Uses `http://localhost:4000` as fallback if no env variable is set
- **Production**: Set `VITE_API_BASE_URL` to your production API URL

## Example .env files

### Frontend (.env)
```bash
VITE_API_BASE_URL=http://localhost:4000
```

### Backend (.env)
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5433/gdi_db"
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback
FRONTEND_URL=http://localhost:5173
```
