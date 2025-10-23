-- =============================================
-- Model & Result Management Database Setup
-- Extension untuk VTON Backend v2.0
-- =============================================

-- Enable UUID extension (if not exists)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. MODEL MANAGEMENT TABLES
-- =============================================

-- User Face Models Table
CREATE TABLE IF NOT EXISTS user_face_models (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL DEFAULT 'default',
    model_path TEXT NOT NULL,
    face_features JSONB,
    accuracy_score FLOAT CHECK (accuracy_score >= 0 AND accuracy_score <= 1),
    training_images TEXT[], -- Array of training image URLs
    is_active BOOLEAN DEFAULT true,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Size Profiles Table
CREATE TABLE IF NOT EXISTS user_size_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL DEFAULT 'default',
    body_measurements JSONB NOT NULL DEFAULT '{}', -- {height, weight, chest, waist, hips, etc.}
    size_preferences JSONB DEFAULT '{}', -- {brand_preferences, fit_preferences}
    recommended_sizes JSONB DEFAULT '{}', -- {top_size, bottom_size, dress_size}
    body_shape TEXT, -- ectomorph, mesomorph, endomorph, hourglass, etc.
    confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. RESULT MANAGEMENT TABLES
-- =============================================

-- Result Analytics Table
CREATE TABLE IF NOT EXISTS result_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES try_on_history(id) ON DELETE CASCADE,
    view_count INTEGER DEFAULT 0,
    is_favorite BOOLEAN DEFAULT false,
    is_shared BOOLEAN DEFAULT false,
    share_token TEXT UNIQUE, -- For public sharing
    quality_score FLOAT CHECK (quality_score >= 0 AND quality_score <= 1),
    user_rating INTEGER CHECK (user_rating >= 1 AND user_rating <= 5),
    feedback_text TEXT,
    tags TEXT[], -- e.g., ['casual', 'formal', 'summer']
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Result Shares Table (for social sharing)
CREATE TABLE IF NOT EXISTS result_shares (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    result_analytics_id UUID REFERENCES result_analytics(id) ON DELETE CASCADE,
    share_token TEXT UNIQUE NOT NULL,
    platform TEXT, -- 'instagram', 'facebook', 'twitter', etc.
    expires_at TIMESTAMPTZ,
    view_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. STORAGE MANAGEMENT TABLES
-- =============================================

-- Storage Usage Tracking
CREATE TABLE IF NOT EXISTS storage_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    bucket_name TEXT NOT NULL,
    file_type TEXT, -- 'garment', 'user_upload', 'result', 'model'
    file_size BIGINT,
    file_path TEXT,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 4. INDEXES FOR PERFORMANCE
-- =============================================

-- Face Models Indexes
CREATE INDEX IF NOT EXISTS idx_user_face_models_user_id ON user_face_models(user_id);
CREATE INDEX IF NOT EXISTS idx_user_face_models_active ON user_face_models(is_active);
CREATE INDEX IF NOT EXISTS idx_user_face_models_created_at ON user_face_models(created_at DESC);

-- Size Profiles Indexes
CREATE INDEX IF NOT EXISTS idx_user_size_profiles_user_id ON user_size_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_size_profiles_active ON user_size_profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_user_size_profiles_created_at ON user_size_profiles(created_at DESC);

-- Result Analytics Indexes
CREATE INDEX IF NOT EXISTS idx_result_analytics_user_id ON result_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_result_analytics_session_id ON result_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_result_analytics_favorite ON result_analytics(is_favorite);
CREATE INDEX IF NOT EXISTS idx_result_analytics_shared ON result_analytics(is_shared);
CREATE INDEX IF NOT EXISTS idx_result_analytics_created_at ON result_analytics(created_at DESC);

-- Result Shares Indexes
CREATE INDEX IF NOT EXISTS idx_result_shares_token ON result_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_result_shares_expires_at ON result_shares(expires_at);

-- Storage Usage Indexes
CREATE INDEX IF NOT EXISTS idx_storage_usage_user_id ON storage_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_storage_usage_bucket ON storage_usage(bucket_name);
CREATE INDEX IF NOT EXISTS idx_storage_usage_file_type ON storage_usage(file_type);
CREATE INDEX IF NOT EXISTS idx_storage_usage_archived ON storage_usage(is_archived);

-- =============================================
-- 5. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS on all user-specific tables
ALTER TABLE user_face_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_size_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE result_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage_usage ENABLE ROW LEVEL SECURITY;

-- Face Models RLS Policies
CREATE POLICY "Users can view own face models" ON user_face_models FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own face models" ON user_face_models FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own face models" ON user_face_models FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own face models" ON user_face_models FOR DELETE
    USING (auth.uid() = user_id);

-- Size Profiles RLS Policies
CREATE POLICY "Users can view own size profiles" ON user_size_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own size profiles" ON user_size_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own size profiles" ON user_size_profiles FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own size profiles" ON user_size_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- Result Analytics RLS Policies
CREATE POLICY "Users can view own result analytics" ON result_analytics FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own result analytics" ON result_analytics FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own result analytics" ON result_analytics FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own result analytics" ON result_analytics FOR DELETE
    USING (auth.uid() = user_id);

-- Storage Usage RLS Policies
CREATE POLICY "Users can view own storage usage" ON storage_usage FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own storage usage" ON storage_usage FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own storage usage" ON storage_usage FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================
-- 6. TRIGGERS AND FUNCTIONS
-- =============================================

-- Function to generate share token
CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS TEXT AS $$
BEGIN
    RETURN 'vton_' || encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_user_face_models_updated_at
    BEFORE UPDATE ON user_face_models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_size_profiles_updated_at
    BEFORE UPDATE ON user_size_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_result_analytics_updated_at
    BEFORE UPDATE ON result_analytics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- 7. VIEWS FOR COMMON QUERIES
-- =============================================

-- User Profile Summary View
CREATE OR REPLACE VIEW user_profile_summary AS
SELECT
    u.id as user_id,
    u.email,
    COUNT(DISTINCT fm.id) as face_models_count,
    COUNT(DISTINCT sp.id) as size_profiles_count,
    COUNT(DISTINCT ra.id) as total_results,
    COUNT(DISTINCT CASE WHEN ra.is_favorite THEN ra.id END) as favorite_results,
    SUM(su.file_size) FILTER (WHERE su.user_id = u.id) as total_storage_used
FROM auth.users u
LEFT JOIN user_face_models fm ON u.id = fm.user_id AND fm.is_active = true
LEFT JOIN user_size_profiles sp ON u.id = sp.user_id AND sp.is_active = true
LEFT JOIN result_analytics ra ON u.id = ra.user_id
LEFT JOIN storage_usage su ON u.id = su.user_id AND su.is_archived = false
GROUP BY u.id, u.email;

-- Popular Garments View
CREATE OR REPLACE VIEW popular_garments AS
SELECT
    g.id,
    g.name,
    g.brand,
    g.category,
    COUNT(DISTINCT toh.id) as usage_count,
    AVG(ra.user_rating) as avg_rating,
    COUNT(DISTINCT CASE WHEN ra.is_favorite THEN ra.id END) as favorite_count
FROM garments g
JOIN try_on_history toh ON g.id = toh.garment_id
LEFT JOIN result_analytics ra ON toh.id = ra.session_id
WHERE toh.status = 'success'
GROUP BY g.id, g.name, g.brand, g.category
ORDER BY usage_count DESC, avg_rating DESC;