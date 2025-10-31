-- Fix Anonymous User Support for try_on_history table
-- Run this in Supabase SQL Editor

-- Option 1: Make user_id nullable and remove FK constraint (RECOMMENDED)
-- This allows anonymous sessions without requiring auth.users entry

ALTER TABLE IF EXISTS try_on_history 
  DROP CONSTRAINT IF EXISTS try_on_history_user_id_fkey;

ALTER TABLE IF EXISTS try_on_history 
  ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policies to allow anonymous inserts
DROP POLICY IF EXISTS "Users can insert own try-on history" ON try_on_history;

CREATE POLICY "Allow anonymous or authenticated inserts"
    ON try_on_history FOR INSERT
    WITH CHECK (
      auth.uid() = user_id OR 
      auth.role() = 'anon' OR 
      auth.role() = 'authenticated'
    );

-- Update SELECT policy
DROP POLICY IF EXISTS "Users can view own try-on history" ON try_on_history;

CREATE POLICY "Allow anonymous or authenticated to view sessions"
    ON try_on_history FOR SELECT
    USING (
      auth.uid() = user_id OR 
      auth.role() = 'anon' OR 
      auth.role() = 'authenticated'
    );

-- Update UPDATE policy  
DROP POLICY IF EXISTS "Users can update own try-on history" ON try_on_history;

CREATE POLICY "Allow anonymous or authenticated to update sessions"
    ON try_on_history FOR UPDATE
    USING (
      auth.uid() = user_id OR 
      auth.role() = 'anon' OR 
      auth.role() = 'authenticated'
    );

-- Note: If you want to keep FK constraint, you can create an anonymous system user:
-- INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at)
-- VALUES (
--   '00000000-0000-0000-0000-000000000000',
--   'anonymous@system.local',
--   crypt('system', gen_salt('bf')),
--   NOW(),
--   NOW(),
--   NOW()
-- );

