# Vercel Deployment Guide

## 🚀 Deploy VTON Backend API ke Vercel

Project ini sudah dikonfigurasi untuk deployment di Vercel. Berikut langkah-langkahnya:

### 1. Prasyarat
- Akun Vercel (https://vercel.com)
- GitHub repository sudah dipush
- Environment variables sudah disiapkan

### 2. Environment Variables yang Diperlukan

Buat file `.env.production` atau set di Vercel Dashboard:

```bash
# Supabase Configuration
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Pixazo API Configuration
PIXAZO_API_URL=https://api.pixazo.ai/v1
PIXAZO_API_KEY=your_pixazo_api_key

# Redis Configuration (untuk job queue)
REDIS_URL=your_redis_connection_string
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=7d

# App Configuration
NODE_ENV=production
PORT=3000
ALLOWED_ORIGINS=https://yourdomain.com,https://lovable.ai

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./uploads
```

### 3. Cara Deploy ke Vercel

#### Method 1: Via Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login ke Vercel
vercel login

# Deploy dari root directory project
vercel --prod

# Follow instruksi di terminal
```

#### Method 2: Via Vercel Dashboard

1. Buka https://vercel.com/new
2. Import dari GitHub: `https://github.com/wirkancil/vton-single-item-backend`
3. Pilih "Node.js" sebagai framework
4. Set environment variables
5. Click "Deploy"

### 4. Konfigurasi Domain (Optional)

Setelah deployment selesai, Anda bisa:
1. Buka Vercel Dashboard
2. Pilih project Anda
3. Go ke "Settings" → "Domains"
4. Add custom domain

### 5. Testing API Endpoint

Setelah deployment, test API endpoints:

```bash
# Health check
curl https://your-app.vercel.app/

# Health check dengan detail
curl https://your-app.vercel.app/api/health

# List available garments
curl https://your-app.vercel.app/api/garments
```

### 6. Monitoring dan Logs

- **Real-time Logs**: Vercel Dashboard → Functions tab
- **Analytics**: Vercel Dashboard → Analytics tab
- **Error Tracking**: Check function logs untuk debugging

### 7. Troubleshooting

#### Common Issues:

1. **Function Timeout**
   - Increase `maxDuration` di `vercel.json`
   - Optimize kode untuk response lebih cepat

2. **Environment Variables Not Working**
   - Pastikan variables di-set di Vercel Dashboard
   - Restart deployment setelah menambah variables

3. **CORS Issues**
   - Update `ALLOWED_ORIGINS` environment variable
   - Include domain frontend Anda

4. **Database Connection Issues**
   - Check Supabase connection strings
   - Verify IP whitelist di Supabase

### 8. Production Best Practices

1. **Security**
   - Jangan expose sensitive data
   - Gunakan HTTPS (automatic di Vercel)
   - Implement rate limiting

2. **Performance**
   - Monitor function execution time
   - Gunakan caching untuk static data
   - Optimasi image processing

3. **Monitoring**
   - Set up error alerts
   - Monitor API usage
   - Track performance metrics

### 9. Update Deployment

Untuk update setelah perubahan kode:

```bash
# Push changes ke GitHub
git add .
git commit -m "Update API"
git push origin main

# Deploy ke Vercel
vercel --prod
```

Atau enable auto-deploy di Vercel Dashboard untuk otomatis deploy setiap push ke main branch.

### 10. API Documentation

API endpoints yang tersedia:
- `GET /` - Root endpoint
- `GET /api/health` - Health check
- `GET /api/garments` - List garments
- `POST /api/try-on` - Create try-on session
- `GET /api/try-on/:sessionId/status` - Get session status
- `GET /api/try-on/history` - Get user history
- `DELETE /api/try-on/:sessionId` - Delete session
- `POST /api/webhooks/pixazo` - Pixazo webhook handler

---

**🎉 Selamat! VTON Backend API Anda siap digunakan di production!**