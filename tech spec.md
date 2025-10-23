

---

## **Full Tech Spec: Optimized Backend API untuk Single Item VTON**

### 1. Gambaran Umum & Filosofi Desain

Dokumen ini merinci spesifikasi untuk membangun backend API yang kuat dan dioptimalkan untuk fungsionalitas **Single Item Virtual Try-On (VTON)**. Desain ini mengutamakan **pengalaman pengguna (UX)** yang responsif dengan menerapkan **pemrosesan asinkron**. Alih-alih membuat pengguna menunggu hasil AI yang bisa memakan waktu puluhan detik, backend akan langsung menerima permintaan, memulai proses di latar belakang, dan memungkinkan frontend untuk memeriksa statusnya secara berkala.

### 2. Arsitektur Sistem

Arsitektur ini memisahkan *request-response cycle* yang cepat dari proses AI yang lambat menggunakan *background job queue*.

```
+----------------+      +---------------------+      +------------------------+
|                |      |                     |      |                        |
| Frontend       |----->| Backend API         |----->| Supabase (DB & Storage)|
| (Lovable)      |      | (Node.js/Express)   |      |                        |
|                |      |                     |      |                        |
+----------------+      +----------+----------+      +------------------------+
                             |          | (3. Update Status)
 (1. Cepat, kirim Job)       |          |
                             v          v
                      +------------------+      +----------------+
                      |                  |----->|                |
                      | Job Queue (Redis)|      | Background     |
                      |                  |<-----| Worker         |
                      +------------------+      | (Pixazo API)   |
                                                 +----------------+
```

**Alur Kerja:**
1.  **Frontend** mengirimkan gambar dan ID pakaian ke **Backend API**.
2.  **Backend API** mengunggah gambar, membuat record dengan status `queued`, menambahkan *job* ke antrian, dan **segera** merespons dengan `session_id`.
3.  **Background Worker** mengambil job, memanggil **Pixazo API**, dan mengunggah hasilnya.
4.  **Worker** mengupdate status di database menjadi `success` atau `failed`.
5.  **Frontend** melakukan *polling* (menanyakan status setiap beberapa detik) ke endpoint khusus hingga mendapatkan status akhir.

### 3. Teknologi Stack

*   **Backend:** Node.js, Express.js
*   **Database:** Supabase (PostgreSQL)
*   **Storage:** Supabase Storage
*   **Authentication:** Supabase Auth (JWT)
*   **Job Queue:** BullMQ
*   **Queue Broker:** Redis
*   **AI Service:** Pixazo Kolors API
*   **HTTP Client:** Axios
*   **File Upload:** Multer

### 4. Skema Database & Storage (Supabase)

#### **4.1. Tabel: `garments`**
Menyimpan data master pakaian.
```sql
CREATE TABLE garments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  brand TEXT,
  category TEXT,
  image_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON garments (category);
```

#### **4.2. Tabel: `try_on_history`**
Menyimpan riwayat sesi. **Penting:** Kolom `status` kunci untuk alur asinkron.
```sql
CREATE TABLE try_on_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  garment_id UUID REFERENCES garments(id) ON DELETE SET NULL,
  original_user_image_url TEXT,
  result_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'queued', -- 'queued', 'processing', 'success', 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON try_on_history (user_id, created_at DESC);
```
**KEAMANAN:** Aktifkan **Row Level Security (RLS)** pada tabel `try_on_history` dengan kebijakan: `user_id = auth.uid()`.

#### **4.3. Struktur Supabase Storage**
Gunakan bucket `vton-assets`.
```
vton-assets/
├── garments/
│   └── {garment_name}.png
├── user-uploads/
│   └── {user_id}/
│       └── {timestamp}_original.jpg
└── try-on-results/
    └── {user_id}/
        └── {session_id}_result.png
```

### 5. Spesifikasi Backend API (Node.js/Express)

#### **5.1. Struktur Proyek**
```
.
├── src/
│   ├── controllers/
│   │   └── tryOnController.js
│   ├── middleware/
│   │   └── authMiddleware.js
│   ├── routes/
│   │   └── tryOn.js
│   ├── services/
│   │   ├── supabaseService.js
│   │   ├── pixazoService.js
│   │   └── queueService.js
│   ├── workers/
│   │   └── vtonWorker.js
│   └── server.js
├── .env
└── package.json
```

#### **5.2. API Endpoints**

| Method | URL | Deskripsi | Authentication |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/try-on` | Memulai sesi VTON, mengembalikan `sessionId` dengan cepat. | Diperlukan |
| `GET` | `/api/try-on/:sessionId/status`| Endpoint untuk polling, mengecek status sesi. | Diperlukan |
| `GET` | `/api/try-on/history` | Mengambil riwayat sesi user yang sudah selesai. | Diperlukan |
| `DELETE`| `/api/try-on/:sessionId` | Menghapus sesi dan file terkait. | Diperlukan |
| `GET` | `/api/garments` | Mendapatkan daftar semua pakaian. | Tidak |

#### **5.3. Contoh Implementasi Kunci**

**`src/controllers/tryOnController.js`**
```javascript
const { v4: uuidv4 } = require('uuid');
const { supabase, uploadImage } = require('../services/supabaseService');
const { tryOnQueue } = require('../services/queueService');

exports.createTryOnSession = async (req, res) => {
  // ... (validasi input)
  const { garmentId } = req.body;
  const userImageFile = req.file;
  const userId = req.user.id;

  try {
    // 1. Upload foto asli
    const userImagePath = `user-uploads/${userId}/${Date.now()}_original.jpg`;
    const originalUserImageUrl = await uploadImage(userImagePath, userImageFile.buffer, userImageFile.mimetype);

    // 2. Buat record dengan status 'queued'
    const sessionId = uuidv4();
    await supabase.from('try_on_history').insert({
      id: sessionId, user_id: userId, garment_id: garmentId,
      original_user_image_url: originalUserImageUrl, status: 'queued'
    });

    // 3. Tambahkan job ke antrian
    await tryOnQueue.add('process-vton', { sessionId, userId, garmentId, originalUserImageUrl });

    // 4. Respon cepat
    res.status(202).json({ success: true, data: { sessionId, status: 'queued' } });

  } catch (error) {
    // ... error handling
  }
};

exports.getSessionStatus = async (req, res) => {
    const { sessionId } = req.params;
    const { data, error } = await supabase
        .from('try_on_history')
        .select('status, result_image_url, error_message')
        .eq('id', sessionId)
        .eq('user_id', req.user.id) // Keamanan
        .single();
    
    if (error) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.status(200).json({ success: true, data });
};
```

**`src/workers/vtonWorker.js` (Proses Background)**
```javascript
const { Worker } = require('bullmq');
const { performVirtualTryOn } = require('../services/pixazoService');
const { uploadImage, supabase } = require('../services/supabaseService');
const { redisConnection } = require('../services/queueService');

new Worker('try-on-queue', async (job) => {
  const { sessionId, userId, garmentId, originalUserImageUrl } = job.data;
  try {
    await supabase.from('try_on_history').update({ status: 'processing' }).eq('id', sessionId);
    
    const { data: garment } = await supabase.from('garments').select('image_url').eq('id', garmentId).single();
    const resultImageStream = await performVirtualTryOn(originalUserImageUrl, garment.image_url);
    
    const resultImagePath = `try-on-results/${userId}/${sessionId}_result.png`;
    const resultImageUrl = await uploadImage(resultImagePath, resultImageStream, 'image/png');
    
    await supabase.from('try_on_history').update({ status: 'success', result_image_url: resultImageUrl }).eq('id', sessionId);
  } catch (error) {
    await supabase.from('try_on_history').update({ status: 'failed', error_message: error.message }).eq('id', sessionId);
  }
}, { connection: redisConnection });
```

---

## **Dokumentasi Integrasi dengan Frontend (Lovable)**

Panduan ini menjelaskan cara menghubungkan frontend Lovable dengan backend API yang telah dioptimalkan.

### Prasyarat di Proyek Lovable

1.  **Integrasi Supabase:** Pastikan proyek Lovable Anda sudah terhubung dengan proyek Supabase yang sama.
2.  **Environment Variable:** Tambahkan environment variable di Lovable:
    *   **Nama:** `VITE_BACKEND_URL`
    *   **Nilai:** `https://<url-backend-anda>.com`

### Langkah 1: Autentikasi - Dapatkan JWT Token

Anda perlu token untuk mengakses endpoint yang dilindungi. Gunakan klien Supabase di Lovable untuk mendapatkannya.

```javascript
// src/lib/supabase.js (atau path yang sesuai)
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Fungsi untuk mendapatkan token
export async function getAuthToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) {
    console.error("User not authenticated");
    return null;
  }
  return session.access_token;
}
```

### Langkah 2: Logika Utama - Upload, Polling, dan Tampilkan Hasil

Buat satu fungsi JavaScript utama yang menangani seluruh alur kerja dari sisi frontend. Fungsi ini akan menggunakan `async/await` dan *polling loop*.

```javascript
import { getAuthToken } from '@/lib/supabase'; // Sesuaikan path import

// Fungsi helper untuk jeda waktu saat polling
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fungsi utama untuk menjalankan proses Try-On.
 * @param {File} userImageFile - File gambar dari input <input type="file">.
 * @param {string} garmentId - ID UUID dari pakaian yang dipilih.
 * @param {function} onStatusChange - Callback untuk update UI (opsional).
 * @param {function} onSuccess - Callback saat berhasil (opsional).
 * @param {function} onError - Callback saat error (opsional).
 */
export async function handleTryOn(userImageFile, garmentId, { onStatusChange, onSuccess, onError }) {
  const token = await getAuthToken();
  if (!token) {
    onError("Anda harus login terlebih dahulu.");
    return;
  }

  try {
    // --- A. Kirim Request dan Dapatkan Session ID ---
    const formData = new FormData();
    formData.append('userImage', userImageFile);
    formData.append('garmentId', garmentId);

    const initialResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/try-on`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    const initialData = await initialResponse.json();
    if (!initialData.success) throw new Error(initialData.message);
    
    const { sessionId } = initialData.data;
    onStatusChange?.('queued'); // Update UI: "Permintaan diterima, mengantri..."

    // --- B. Polling untuk Mendapatkan Hasil ---
    let resultData;
    while (true) {
      const statusResponse = await fetch(`${import.meta.env.VITE_BACKEND_URL}/api/try-on/${sessionId}/status`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const statusResult = await statusResponse.json();
      if (!statusResult.success) throw new Error(statusResult.message);
      
      resultData = statusResult.data;
      onStatusChange?.(resultData.status); // Update UI: "Memproses..."

      if (resultData.status === 'success') break;
      if (resultData.status === 'failed') throw new Error(resultData.error_message || 'Proses gagal.');
      
      await delay(2000); // Tunggu 2 detik sebelum cek lagi
    }

    // --- C. Tampilkan Hasil ---
    onSuccess?.(resultData.resultImageUrl);

  } catch (error) {
    console.error("Error during try-on:", error);
    onError?.(error.message);
  }
}
```

### Langkah 3: Implementasi di Komponen Lovable

Gunakan fungsi `handleTryOn` di dalam komponen Anda, misalnya pada event `onClick` sebuah tombol.

```jsx
// Misalnya di dalam file komponen Lovable Anda
import { useState } from 'react';
import { handleTryOn } from './lib/vtonService'; // Path ke fungsi handleTryOn

function TryOnComponent() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedGarmentId, setSelectedGarmentId] = useState('some-uuid-from-api');
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [resultImage, setResultImage] = useState(null);
  const [error, setError] = useState('');

  const onTryNowClick = async () => {
    if (!selectedFile || !selectedGarmentId) {
      setError('Silakan pilih foto dan pakaian terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    setError('');
    setResultImage('');
    setStatusMessage('Mengirim permintaan...');

    await handleTryOn(selectedFile, selectedGarmentId, {
      onStatusChange: (status) => {
        const messages = {
          'queued': 'Permintaan diterima, sedang mengantri.',
          'processing': 'Sedang memproses gambar, mohon tunggu...',
        };
        setStatusMessage(messages[status] || status);
      },
      onSuccess: (imageUrl) => {
        setStatusMessage('Proses selesai!');
        setResultImage(imageUrl);
        setIsLoading(false);
      },
      onError: (message) => {
        setError(`Terjadi kesalahan: ${message}`);
        setIsLoading(false);
      }
    });
  };

  return (
    <div>
      {/* ... Input untuk file dan pemilihan garment ... */}
      <button onClick={onTryNowClick} disabled={isLoading}>
        {isLoading ? 'Memproses...' : 'Coba Sekarang'}
      </button>

      {statusMessage && <p>{statusMessage}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {resultImage && <img src={resultImage} alt="Hasil Try-On" />}
    </div>
  );
}
```

Dengan mengikuti spesifikasi dan panduan ini, Anda akan memiliki sistem VTON yang andal, skalabel, dan memberikan pengalaman pengguna yang modern di frontend Lovable.