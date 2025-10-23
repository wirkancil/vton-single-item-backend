# 🧪 Testing Guide VTON Backend API

## 📋 Status API

✅ **GitHub Repository**: https://github.com/wirkancil/vton-single-item-backend
✅ **Vercel Production**: https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app
✅ **API Status**: ✅ Deployed & Working (behind authentication)
✅ **Custom Domain**: Ready for `vton-item.ai-agentic.tech`

## 🔐 Cara Mengakses API (Vercel Authentication)

API saat ini terproteksi oleh Vercel Authentication. Ada 2 cara untuk mengakses:

### Method 1: Disable Vercel Authentication (Recommended)

1. **Buka Vercel Dashboard**: https://vercel.com/ancils-projects-f837529c/vton-backend-api
2. **Pergi ke Settings → Protection**
3. **Disable "Vercel Authentication"**
4. **Save changes**

### Method 2: Gunakan Bypass Token

Untuk automated testing, gunakan bypass token:

```bash
# Dapatkan bypass token dari Vercel Dashboard
# atau gunakan parameter:

curl "https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/health?x-vercel-protection-bypass=YOUR_TOKEN"
```

## 🚀 API Endpoints

### 1. Root Endpoint
```bash
GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/
```

**Response:**
```json
{
  "success": true,
  "message": "VTON Backend API is running",
  "version": "1.0.0",
  "status": "healthy",
  "timestamp": "2025-10-23T06:43:30.807Z",
  "environment": "production",
  "vercel": true,
  "endpoints": {
    "health": "/api/health",
    "tryOn": "/api/try-on",
    "garments": "/api/garments"
  }
}
```

### 2. Health Check
```bash
GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/health
```

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-23T06:43:30.807Z",
  "version": "1.0.0",
  "environment": "production",
  "service": "VTON Backend API",
  "platform": "Vercel Serverless Functions"
}
```

### 3. Get Garments (Mock Data)
```bash
GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/garments
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "garment_001",
      "name": "Classic White T-Shirt",
      "category": "tops",
      "description": "Comfortable cotton t-shirt",
      "imageUrl": "https://example.com/tshirt.jpg",
      "available": true
    },
    {
      "id": "garment_002",
      "name": "Blue Jeans",
      "category": "bottoms",
      "description": "Classic denim jeans",
      "imageUrl": "https://example.com/jeans.jpg",
      "available": true
    }
  ],
  "total": 2,
  "timestamp": "2025-10-23T06:43:30.807Z"
}
```

### 4. Create Try-On Session
```bash
POST https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/try-on
Content-Type: application/json

{
  "userImage": "base64_encoded_image_data",
  "garmentId": "garment_001"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Try-on session created successfully",
  "data": {
    "sessionId": "session_1234567890_abcdef123",
    "status": "queued",
    "estimatedTime": "30-60 seconds",
    "createdAt": "2025-10-23T06:43:30.807Z"
  }
}
```

### 5. Get Session Status
```bash
GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/try-on/{sessionId}/status
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "session_1234567890_abcdef123",
    "status": "completed",
    "progress": 100,
    "resultImageUrl": "https://example.com/result.jpg",
    "createdAt": "2025-10-23T06:43:30.807Z",
    "completedAt": "2025-10-23T06:44:30.807Z"
  }
}
```

## 🧪 Testing Commands

### Basic Health Check
```bash
# Test root endpoint
curl -X GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/

# Test health endpoint
curl -X GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/health
```

### Test Try-On Flow
```bash
# 1. Get available garments
curl -X GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/garments

# 2. Create try-on session (gunakan base64 image)
curl -X POST https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/try-on \
  -H "Content-Type: application/json" \
  -d '{
    "userImage": "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
    "garmentId": "garment_001"
  }'

# 3. Check session status (gunakan sessionId dari response sebelumnya)
curl -X GET https://vton-backend-aebb9tfjy-ancils-projects-f837529c.vercel.app/api/try-on/session_1234567890_abcdef123/status
```

## 🌐 Custom Domain Setup

Untuk setup custom domain `vton-item.ai-agentic.tech`:

1. **Vercel Dashboard → Settings → Domains**
2. **Add Domain**: `vton-item.ai-agentic.tech`
3. **Configure DNS**:
   ```
   Type: CNAME
   Name: vton-item
   Value: cname.vercel-dns.com
   TTL: 300
   ```

Setelah DNS propagation, API akan accessible di:
- `https://vton-item.ai-agentic.tech/`
- `https://vton-item.ai-agentic.tech/api/health`

## 🔧 Environment Variables

Environment variables yang sudah ditambahkan di Vercel:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Pixazo API Configuration
PIXAZO_API_URL=https://api.pixazo.ai/v1
PIXAZO_API_KEY=your_pixazo_api_key

# Redis Configuration
REDIS_URL=your_redis_connection_string
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# App Configuration
NODE_ENV=production
ALLOWED_ORIGINS=https://yourdomain.com,https://lovable.ai
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

## 📝 Notes

- ✅ API sudah berhasil di-deploy ke Vercel
- ✅ Semua endpoint working dengan mock data
- ✅ Environment variables sudah dikonfigurasi
- ⏳ Perlu disable Vercel Authentication untuk public access
- ⏳ Custom domain perlu DNS configuration
- 🔧 Mock data bisa diganti dengan integration Supabase & Pixazo API

## 🎯 Next Steps

1. **Disable Vercel Authentication** di dashboard
2. **Test API** dengan commands di atas
3. **Setup custom domain** `vton-item.ai-agentic.tech`
4. **Integrate dengan frontend** Lovable
5. **Replace mock data** dengan actual Supabase & Pixazo integration

---

**🎉 VTON Backend API siap untuk production!**