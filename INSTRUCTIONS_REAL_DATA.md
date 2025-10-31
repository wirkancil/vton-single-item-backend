# 📋 Instruksi: Konfigurasi Database untuk Real Data (Tanpa Mock)

## 🔧 Langkah yang Perlu Dilakukan

### 1. Run SQL Migration di Supabase

Untuk mendukung anonymous users dan menghilangkan mock data, **WAJIB** menjalankan SQL migration berikut:

**File:** `fix-anonymous-user.sql`

**Cara:**
1. Buka Supabase Dashboard
2. Masuk ke SQL Editor
3. Copy-paste isi file `fix-anonymous-user.sql`
4. Klik "Run" untuk execute

**Apa yang dilakukan:**
- ✅ Menghapus FK constraint pada `user_id` 
- ✅ Membuat `user_id` menjadi nullable
- ✅ Update RLS policies untuk support anonymous users

### 2. Verifikasi Migration

Setelah migration, verifikasi dengan:

```sql
-- Check constraint sudah dihapus
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'try_on_history' 
AND constraint_type = 'FOREIGN KEY';

-- Check user_id bisa NULL
SELECT column_name, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'try_on_history' 
AND column_name = 'user_id';
```

### 3. Test Backend

Setelah migration selesai, test dengan:

```bash
node test-with-download.js
```

## ✅ Hasil yang Diharapkan

Setelah migration:
- ✅ Anonymous users bisa create session (user_id = NULL)
- ✅ Session tersimpan ke database
- ✅ Status endpoint return real data (tidak mock)
- ✅ Result image URL dari Supabase (tidak mock)
- ✅ Download hasil berfungsi

## ⚠️ Jika Migration Belum Di-run

Jika belum run migration, akan dapat error:
```json
{
  "success": false,
  "message": "Database configuration error: Anonymous users not supported",
  "error": "Foreign key constraint requires user_id to exist in auth.users...",
  "solution": "Run the SQL migration in fix-anonymous-user.sql to allow anonymous sessions"
}
```

## 📝 Checklist

- [ ] Run SQL migration `fix-anonymous-user.sql` di Supabase
- [ ] Verifikasi constraint sudah dihapus
- [ ] Test create session dengan anonymous user
- [ ] Test status endpoint return real data
- [ ] Test download hasil image

---

**Setelah migration, semua data akan REAL - tidak ada mock!** 🎯

