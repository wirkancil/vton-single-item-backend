-- Manual Storage Policies for VTON
-- Run these commands manually in Supabase Dashboard with proper privileges

-- 1. Enable RLS on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Create policies for vton-assets bucket
CREATE POLICY "Allow anonymous uploads to vton-assets" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'vton-assets'
  AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
);

CREATE POLICY "Allow anonymous read from vton-assets" ON storage.objects
FOR SELECT USING (
  bucket_id = 'vton-assets'
  AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
);

CREATE POLICY "Allow anonymous update in vton-assets" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'vton-assets'
  AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
);

CREATE POLICY "Allow anonymous delete in vton-assets" ON storage.objects
FOR DELETE USING (
  bucket_id = 'vton-assets'
  AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
);

-- 3. Grant permissions
GRANT ALL ON storage.objects TO anon, authenticated;
GRANT USAGE ON SCHEMA storage TO anon, authenticated;

-- 4. Verify policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';