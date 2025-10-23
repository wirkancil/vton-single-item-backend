-- =============================================
-- COMPLETE VTON SUPABASE SETUP SCRIPT
-- Execute this in Supabase SQL Editor
-- =============================================

-- Step 1: Run main database setup
-- This includes all tables, indexes, RLS, functions, and sample data

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. CREATE TABLES
-- =============================================

-- Garments table - stores clothing item data
CREATE TABLE IF NOT EXISTS garments (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    brand TEXT,
    category TEXT,
    description TEXT,
    image_url TEXT NOT NULL,
    thumbnail_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for garments table
CREATE INDEX IF NOT EXISTS idx_garments_category ON garments(category);
CREATE INDEX IF NOT EXISTS idx_garments_brand ON garments(brand);
CREATE INDEX IF NOT EXISTS idx_garments_is_active ON garments(is_active);
CREATE INDEX IF NOT EXISTS idx_garments_created_at ON garments(created_at DESC);

-- Try-on history table - stores user try-on sessions
CREATE TABLE IF NOT EXISTS try_on_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    garment_id UUID REFERENCES garments(id) ON DELETE SET NULL,
    original_user_image_url TEXT,
    result_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'success', 'failed')),
    error_message TEXT,
    processing_started_at TIMESTAMPTZ,
    processing_completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for try_on_history table
CREATE INDEX IF NOT EXISTS idx_try_on_history_user_id ON try_on_history(user_id);
CREATE INDEX IF NOT EXISTS idx_try_on_history_garment_id ON try_on_history(garment_id);
CREATE INDEX IF NOT EXISTS idx_try_on_history_status ON try_on_history(status);
CREATE INDEX IF NOT EXISTS idx_try_on_history_created_at ON try_on_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_try_on_history_user_status ON try_on_history(user_id, status);

-- =============================================
-- 2. ENABLE ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on try_on_history table
ALTER TABLE try_on_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view own try-on history" ON try_on_history;
DROP POLICY IF EXISTS "Users can insert own try-on history" ON try_on_history;
DROP POLICY IF EXISTS "Users can update own try-on history" ON try_on_history;
DROP POLICY IF EXISTS "Users can delete own try-on history" ON try_on_history;

-- Create RLS policies for try_on_history
-- Users can only see their own try-on history
CREATE POLICY "Users can view own try-on history"
    ON try_on_history FOR SELECT
    USING (auth.uid() = user_id);

-- Users can only insert their own try-on history
CREATE POLICY "Users can insert own try-on history"
    ON try_on_history FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can only update their own try-on history
CREATE POLICY "Users can update own try-on history"
    ON try_on_history FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can only delete their own try-on history
CREATE POLICY "Users can delete own try-on history"
    ON try_on_history FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================
-- 3. CREATE FUNCTIONS AND TRIGGERS
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS update_garments_updated_at ON garments;
DROP TRIGGER IF EXISTS update_try_on_history_updated_at ON try_on_history;
DROP TRIGGER IF EXISTS update_processing_timestamps_trigger ON try_on_history;

-- Create triggers for updated_at
CREATE TRIGGER update_garments_updated_at
    BEFORE UPDATE ON garments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_try_on_history_updated_at
    BEFORE UPDATE ON try_on_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to update processing timestamps
CREATE OR REPLACE FUNCTION update_processing_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Set processing_started_at when status changes to 'processing'
    IF OLD.status != 'processing' AND NEW.status = 'processing' THEN
        NEW.processing_started_at = NOW();
    END IF;

    -- Set processing_completed_at when status changes to 'success' or 'failed'
    IF OLD.status NOT IN ('success', 'failed') AND NEW.status IN ('success', 'failed') THEN
        NEW.processing_completed_at = NOW();
    END IF;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for processing timestamps
CREATE TRIGGER update_processing_timestamps_trigger
    BEFORE UPDATE ON try_on_history
    FOR EACH ROW EXECUTE FUNCTION update_processing_timestamps();

-- =============================================
-- 4. CREATE VIEWS FOR COMMON QUERIES
-- =============================================

-- Drop existing views if they exist
DROP VIEW IF EXISTS user_try_on_history;
DROP VIEW IF EXISTS active_garments;
DROP VIEW IF EXISTS try_on_statistics;

-- View for user try-on history with garment details
CREATE OR REPLACE VIEW user_try_on_history AS
SELECT
    t.id as session_id,
    t.user_id,
    t.garment_id,
    t.original_user_image_url,
    t.result_image_url,
    t.status,
    t.error_message,
    t.processing_started_at,
    t.processing_completed_at,
    t.created_at,
    t.updated_at,
    g.name as garment_name,
    g.brand as garment_brand,
    g.category as garment_category,
    g.image_url as garment_image_url,
    g.thumbnail_url as garment_thumbnail_url,
    -- Calculate processing duration
    CASE
        WHEN t.processing_started_at IS NOT NULL AND t.processing_completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (t.processing_completed_at - t.processing_started_at))
        ELSE NULL
    END as processing_duration_seconds
FROM try_on_history t
LEFT JOIN garments g ON t.garment_id = g.id;

-- View for active garments
CREATE OR REPLACE VIEW active_garments AS
SELECT
    id,
    name,
    brand,
    category,
    description,
    image_url,
    thumbnail_url,
    created_at,
    updated_at
FROM garments
WHERE is_active = true;

-- View for try-on statistics
CREATE OR REPLACE VIEW try_on_statistics AS
SELECT
    DATE_TRUNC('day', created_at) as date,
    status,
    COUNT(*) as count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT garment_id) as unique_garments
FROM try_on_history
GROUP BY DATE_TRUNC('day', created_at), status
ORDER BY date DESC, status;

-- =============================================
-- 5. SAMPLE DATA (Optional - for testing)
-- =============================================

-- Insert sample garments (remove in production)
INSERT INTO garments (name, brand, category, image_url, thumbnail_url) VALUES
('Classic White T-Shirt', 'Basic Brand', 'Tops', 'https://example.com/garments/white-tshirt.jpg', 'https://example.com/garments/thumbnails/white-tshirt.jpg'),
('Blue Denim Jeans', 'Denim Co', 'Bottoms', 'https://example.com/garments/blue-jeans.jpg', 'https://example.com/garments/thumbnails/blue-jeans.jpg'),
('Black Leather Jacket', 'Leather Works', 'Outerwear', 'https://example.com/garments/black-jacket.jpg', 'https://example.com/garments/thumbnails/black-jacket.jpg'),
('Red Summer Dress', 'Summer Style', 'Dresses', 'https://example.com/garments/red-dress.jpg', 'https://example.com/garments/thumbnails/red-dress.jpg'),
('Sneakers White', 'Sport Feet', 'Footwear', 'https://example.com/garments/white-sneakers.jpg', 'https://example.com/garments/thumbnails/white-sneakers.jpg')
ON CONFLICT DO NOTHING;

-- =============================================
-- 6. UTILITY FUNCTIONS
-- =============================================

-- Function to clean up old failed sessions
CREATE OR REPLACE FUNCTION cleanup_old_failed_sessions(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM try_on_history
    WHERE status = 'failed'
    AND created_at < NOW() - INTERVAL '1 day' * days_old;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get user's active sessions
CREATE OR REPLACE FUNCTION get_user_active_sessions(user_uuid UUID)
RETURNS TABLE (
    session_id UUID,
    garment_name TEXT,
    status TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        g.name,
        t.status,
        t.created_at
    FROM try_on_history t
    LEFT JOIN garments g ON t.garment_id = g.id
    WHERE t.user_id = user_uuid
    AND t.status IN ('queued', 'processing')
    ORDER BY t.created_at DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. VERIFICATION
-- =============================================

-- Show table information
SELECT
    'Tables Created' as info_type,
    tablename as table_name,
    schemaname as schema_name
FROM pg_tables
WHERE tablename IN ('garments', 'try_on_history');

-- Show RLS status
SELECT
    'RLS Status' as info_type,
    tablename as table_name,
    rowsecurity as rls_enabled,
    forcerlspolicy as force_rls
FROM pg_tables
WHERE tablename = 'try_on_history';

-- Show indexes created
SELECT
    'Indexes Created' as info_type,
    schemaname as schema_name,
    tablename as table_name,
    indexname as index_name
FROM pg_indexes
WHERE tablename IN ('garments', 'try_on_history')
ORDER BY tablename, indexname;

-- Show views created
SELECT
    'Views Created' as info_type,
    table_name as view_name,
    schema_name
FROM information_schema.views
WHERE table_name IN ('user_try_on_history', 'active_garments', 'try_on_statistics');

-- Show functions created
SELECT
    'Functions Created' as info_type,
    routine_name as function_name,
    routine_schema as schema_name
FROM information_schema.routines
WHERE routine_name IN ('update_updated_at_column', 'update_processing_timestamps', 'cleanup_old_failed_sessions', 'get_user_active_sessions');

-- Show sample data count
SELECT
    'Sample Data' as info_type,
    'garments' as table_name,
    COUNT(*) as record_count
FROM garments;

SELECT
    'Setup Complete!' as final_status,
    NOW() as completion_time;

COMMIT;