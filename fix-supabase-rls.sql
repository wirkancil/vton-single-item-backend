-- Fix Supabase RLS Policies for VTON Backend
-- Run these SQL commands in Supabase SQL Editor

-- 1. Enable RLS on storage.objects if not already enabled
ALTER TABLE IF NOT EXISTS storage.objects ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing conflicting policies (if they exist)
DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects;

-- 3. Create policies for vton-assets bucket
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

-- 4. Create policies for try-on sessions table (if it exists)
ALTER TABLE IF EXISTS public.try_on_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sessions" ON public.try_on_sessions;
DROP POLICY IF EXISTS "Users can create own sessions" ON public.try_on_sessions;

CREATE POLICY "Users can view own sessions" ON public.try_on_sessions
FOR SELECT USING (auth.uid()::text = user_id::text OR auth.role() = 'anon');

CREATE POLICY "Users can create own sessions" ON public.try_on_sessions
FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR auth.role() = 'anon');

CREATE POLICY "Users can update own sessions" ON public.try_on_sessions
FOR UPDATE USING (auth.uid()::text = user_id::text OR auth.role() = 'anon');

-- 5. Create policies for garments table (if it exists)
ALTER TABLE IF EXISTS public.garments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active garments" ON public.garments;

CREATE POLICY "Anyone can view active garments" ON public.garments
FOR SELECT USING (is_active = true);

-- 6. Grant necessary permissions
GRANT USAGE ON SCHEMA storage TO anon, authenticated;
GRANT ALL ON storage.objects TO anon, authenticated;
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- 7. Create function to handle bucket permissions
CREATE OR REPLACE FUNCTION storage.handle_new_bucket()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow anonymous access to vton-assets bucket
  IF NEW.name = 'vton-assets' THEN
    INSERT INTO storage.policies (name, definition, bucket_id)
    VALUES (
      'vton-assets-public',
      'bucket_id = ''vton-assets'' AND (auth.role() = ''anon'' OR auth.role() = ''authenticated'')',
      'vton-assets'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Create trigger for new buckets
DROP TRIGGER IF EXISTS on_new_bucket ON storage.buckets;
CREATE TRIGGER on_new_bucket
  BEFORE INSERT ON storage.buckets
  FOR EACH ROW EXECUTE FUNCTION storage.handle_new_bucket();

-- 9. Verify policies are in place
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname IN ('public', 'storage')
  AND tablename IN ('try_on_sessions', 'garments', 'objects')
ORDER BY tablename, policyname;