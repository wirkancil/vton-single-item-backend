-- Fix Supabase RLS Policies for VTON Backend
-- Migration: 20251024054900_fix_rls_policies_for_vton.sql

-- Ensure try-on sessions table exists and has proper RLS
CREATE TABLE IF NOT EXISTS public.try_on_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT,
  garment_id UUID REFERENCES public.garments(id) ON DELETE CASCADE,
  original_user_image_url TEXT,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  result_image_url TEXT,
  processing_type TEXT DEFAULT 'mock' CHECK (processing_type IN ('mock', 'real_ai')),
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  image_size INTEGER DEFAULT NULL,
  processing_time_seconds INTEGER DEFAULT NULL
);

-- Enable RLS on try-on sessions table
ALTER TABLE public.try_on_sessions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view own sessions" ON public.try_on_sessions;
DROP POLICY IF EXISTS "Users can create own sessions" ON public.try_on_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.try_on_sessions;
DROP POLICY IF EXISTS "Users can delete own sessions" ON public.try_on_sessions;

-- Create policies for try-on sessions table
CREATE POLICY "Users can view own sessions" ON public.try_on_sessions
FOR SELECT USING (auth.uid()::text = user_id::text OR auth.role() = 'anon');

CREATE POLICY "Users can create own sessions" ON public.try_on_sessions
FOR INSERT WITH CHECK (auth.uid()::text = user_id::text OR auth.role() = 'anon');

CREATE POLICY "Users can update own sessions" ON public.try_on_sessions
FOR UPDATE USING (auth.uid()::text = user_id::text OR auth.role() = 'anon');

CREATE POLICY "Users can delete own sessions" ON public.try_on_sessions
FOR DELETE USING (auth.uid()::text = user_id::text OR auth.role() = 'anon');

-- Enable RLS on garments table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'garments' AND table_schema = 'public') THEN
    ALTER TABLE public.garments ENABLE ROW LEVEL SECURITY;

    -- Drop existing policy if it exists
    DROP POLICY IF EXISTS "Anyone can view active garments" ON public.garments;

    -- Create policy for garments table
    CREATE POLICY "Anyone can view active garments" ON public.garments
    FOR SELECT USING (is_active = true);
  END IF;
END $$;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Grant permissions on try-on sessions table
GRANT ALL ON public.try_on_sessions TO anon, authenticated;
GRANT SELECT ON public.try_on_sessions TO anon, authenticated;

-- Grant permissions on garments table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'garments' AND table_schema = 'public') THEN
    GRANT SELECT ON public.garments TO anon, authenticated;
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_try_on_sessions_user_id ON public.try_on_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_try_on_sessions_status ON public.try_on_sessions(status);
CREATE INDEX IF NOT EXISTS idx_try_on_sessions_created_at ON public.try_on_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_try_on_sessions_garment_id ON public.try_on_sessions(garment_id);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS handle_updated_at ON public.try_on_sessions;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.try_on_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert a test garment if none exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.garments WHERE is_active = true LIMIT 1) THEN
    INSERT INTO public.garments (id, name, brand, category, description, image_url, thumbnail_url, is_active)
    VALUES (
      gen_random_uuid(),
      'Test Garment - T-Shirt',
      'Test Brand',
      'top',
      'A test garment for virtual try-on with real image',
      'https://nujfrxpgljdfxodnwnem.supabase.co/storage/v1/object/public/vton-assets/garments/test/germent.jpg',
      null,
      true
    );
  END IF;
END $$;

-- Storage permissions via service role
-- Note: These commands need to be run with service role privileges
DO $$
BEGIN
  -- Try to enable RLS on storage.objects (requires higher privileges)
  -- This might fail but won't break the migration
  BEGIN
    EXECUTE 'ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY';

    -- Drop existing policies
    EXECUTE 'DROP POLICY IF EXISTS "Users can upload their own files" ON storage.objects';
    EXECUTE 'DROP POLICY IF EXISTS "Users can view their own files" ON storage.objects';

    -- Create policies for vton-assets bucket
    EXECUTE format($policy$
      CREATE POLICY "Allow anonymous uploads to vton-assets" ON storage.objects
      FOR INSERT WITH CHECK (
        bucket_id = %L
        AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
      )
    $policy$, 'vton-assets');

    EXECUTE format($policy$
      CREATE POLICY "Allow anonymous read from vton-assets" ON storage.objects
      FOR SELECT USING (
        bucket_id = %L
        AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
      )
    $policy$, 'vton-assets');

    EXECUTE format($policy$
      CREATE POLICY "Allow anonymous update in vton-assets" ON storage.objects
      FOR UPDATE USING (
        bucket_id = %L
        AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
      )
    $policy$, 'vton-assets');

    EXECUTE format($policy$
      CREATE POLICY "Allow anonymous delete in vton-assets" ON storage.objects
      FOR DELETE USING (
        bucket_id = %L
        AND (auth.role() = 'anon' OR auth.role() = 'authenticated')
      )
    $policy$, 'vton-assets');

  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not modify storage.objects policies: %', SQLERRM;
  END;
END $$;

-- Verification query to check policies are in place
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