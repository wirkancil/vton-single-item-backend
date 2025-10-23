# VTON Backend API

Backend API yang dioptimalkan untuk sistem **Single Item Virtual Try-On (VTON)** dengan dukungan deployment ke Vercel.

## 🚀 Fitur Utama

- **⚡ Asynchronous Processing** - User tidak perlu menunggu hasil AI yang lama
- **🔄 Background Processing** - Menggunakan job queue untuk processing
- **👤 User Authentication** - Integrasi dengan Supabase Auth
- **📱 File Upload** - Support untuk gambar user dan garment
- **🎯 AI Integration** - Terintegrasi dengan Pixazo API
- **📊 Status Tracking** - Real-time status untuk setiap sesi
- **🛡️ Security** - Row Level Security (RLS) untuk data privacy
- **☁️ Cloud Ready** - Siap deploy ke Vercel dengan custom domain

## 📋 Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** Supabase (PostgreSQL)
- **Storage:** Supabase Storage
- **Authentication:** Supabase Auth (JWT)
- **AI Service:** Pixazo API
- **File Upload:** Multer
- **Deployment:** Vercel Serverless Functions
- **Domain:** `vton.ai-agentic.tech`

## 🛠️ Installation & Setup

### Prerequisites

1. **Node.js** >= 18.0.0
2. **Supabase** Project
3. **Pixazo API** Key

### Langkah 1: Clone & Install

```bash
git clone https://github.com/username/vton-backend.git
cd vton-backend
npm install
```

### Langkah 2: Environment Setup

```bash
# Copy template environment file
cp .env.example .env

# Edit .env file dengan konfigurasi Anda
nano .env
```

**Environment Variables:**

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_ANON_KEY=your_supabase_anon_key

# Pixazo AI Service
PIXAZO_API_URL=https://gateway.pixazo.ai/virtual-tryon/v1/r-vton
PIXAZO_API_KEY=your_pixazo_api_key

# Production Configuration
BASE_URL=https://vton.ai-agentic.tech
ALLOWED_ORIGINS=https://lovable.ai,https://vton.ai-agentic.tech

# File Upload Configuration
MAX_FILE_SIZE=10485760
ALLOWED_MIME_TYPES=image/jpeg,image/jpg,image/png

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Webhook Security
PIXAZO_WEBHOOK_SECRET=your_webhook_secret
```

### Langkah 3: Database Setup

```bash
# Run database setup script
npm run setup:db
```

## 🚀 Deployment

### Deployment ke Vercel

1. **Install Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Login ke Vercel:**
   ```bash
   vercel login
   ```

3. **Deploy ke Production:**
   ```bash
   vercel --prod
   ```

4. **Setup Environment Variables** di Vercel Dashboard
5. **Configure Custom Domain** `vton.ai-agentic.tech`

Detail deployment guide: [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)

## 📚 API Documentation

### Base URL
```
https://vton.ai-agentic.tech
```

### Endpoints

#### 🔐 Authenticated Endpoints

##### `POST /api/try-on`
Create new try-on session

**Request:**
- **Headers:** `Authorization: Bearer <JWT_TOKEN>`
- **Body:** `multipart/form-data`
  - `userImage` (file) - Foto user
  - `garmentId` (string) - ID UUID garment

**Response:**
```json
{
  "success": true,
  "message": "Try-on session created successfully. Processing started.",
  "data": {
    "sessionId": "uuid",
    "status": "queued",
    "createdAt": "2025-01-01T00:00:00Z",
    "estimatedProcessingTime": 45
  }
}
```

##### `GET /api/try-on/:sessionId/status`
Check session status

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "uuid",
    "status": "success",
    "createdAt": "2025-01-01T00:00:00Z",
    "resultImageUrl": "https://..."
  }
}
```

##### `GET /api/try-on/history`
Get user's try-on history

**Query Parameters:**
- `status` (optional) - Filter by status
- `limit` (optional) - Default 10
- `offset` (optional) - Default 0

##### `DELETE /api/try-on/:sessionId`
Delete try-on session

#### 🌐 Public Endpoints

##### `GET /api/garments`
Get all available garments

**Query Parameters:**
- `category` (optional) - Filter by category
- `brand` (optional) - Filter by brand
- `limit` (optional) - Default 50
- `offset` (optional) - Default 0

##### `GET /api/health`
Health check endpoint

##### `POST /api/webhooks/pixazo`
Pixazo API webhook receiver

## 🔧 Integrasi dengan Frontend (Lovable)

### Environment Variable di Lovable
```env
VITE_BACKEND_URL=https://vton.ai-agentic.tech
```

### Example Usage
```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export async function handleTryOn(userImageFile, garmentId) {
  const { data: { session } } = await supabase.auth.getSession()

  const formData = new FormData()
  formData.append('userImage', userImageFile)
  formData.append('garmentId', garmentId)

  const response = await fetch(`https://vton.ai-agentic.tech/api/try-on`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${session.access_token}` },
    body: formData,
  })

  const result = await response.json()
  return result
}
```

## 🏗️ Project Structure

```
src/
├── api/                 # Vercel serverless functions
│   ├── index.js        # Main API router
│   ├── try-on.js       # Try-on endpoints
│   └── webhooks.js     # Webhook handlers
├── controllers/         # Route controllers
├── middleware/          # Express middleware
├── services/           # Business logic & external services
├── workers/            # Background workers
└── server.js           # Express app setup (local dev)
scripts/
├── setupDatabase.js    # Database setup helper
└── setupDatabase.sql   # SQL setup script
```

## 🔒 Security Features

1. **JWT Validation** - Validasi token Supabase di setiap request
2. **Row Level Security** - Hanya user bisa akses data mereka
3. **File Upload Validation** - Validasi tipe dan ukuran file
4. **Rate Limiting** - Prevent abuse
5. **CORS Configuration** - Restrict allowed origins
6. **Webhook Security** - Signature verification untuk callbacks

## 🐛 Troubleshooting

### Common Issues

1. **Vercel Function Timeout**
   - Increase timeout di `vercel.json`
   - Default: 120 seconds

2. **CORS Issues**
   - Check `ALLOWED_ORIGINS` environment variable
   - Verify frontend URL configuration

3. **File Upload Failed**
   - Check storage bucket policies
   - Verify file size limits

4. **Pixazo API Issues**
   - Verify API key configuration
   - Check callback URL accessibility

## 📊 Monitoring

- **Vercel Dashboard** - Monitor function execution
- **Health Check** - `GET /api/health`
- **Rate Limiting** - Automatic abuse prevention
- **Error Logging** - Comprehensive error tracking

## 📝 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Create Pull Request

## 📞 Support

Untuk support atau questions:
- Issues: [GitHub Issues](https://github.com/username/vton-backend/issues)

---

**🚀 Ready for Production Deployment on Vercel!**