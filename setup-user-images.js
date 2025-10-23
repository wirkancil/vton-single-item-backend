require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Supabase configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupUserImagesTable() {
  try {
    console.log('🔧 Setting up user_images table...');

    // Check if user_images table exists
    console.log('🔍 Checking existing user_images table...');
    const { data: existingTable, error: checkError } = await supabase
      .from('user_images')
      .select('id')
      .limit(1);

    if (checkError && checkError.code === 'PGRST116') {
      console.log('⚠️  user_images table not found, creating...');

      // Create user_images table using raw SQL
      const { error: createError } = await supabase.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS user_images (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
            session_id UUID REFERENCES try_on_history(id) ON DELETE CASCADE,
            original_filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            public_url TEXT NOT NULL,
            file_size BIGINT NOT NULL,
            content_type TEXT NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_user_images_user_id ON user_images(user_id);
          CREATE INDEX IF NOT EXISTS idx_user_images_session_id ON user_images(session_id);
          CREATE INDEX IF NOT EXISTS idx_user_images_created_at ON user_images(created_at DESC);

          -- Enable Row Level Security
          ALTER TABLE user_images ENABLE ROW LEVEL SECURITY;

          -- Create RLS policies
          CREATE POLICY "Users can view their own images" ON user_images
            FOR SELECT USING (auth.uid() = user_id);

          CREATE POLICY "Users can insert their own images" ON user_images
            FOR INSERT WITH CHECK (auth.uid() = user_id);

          CREATE POLICY "Users can delete their own images" ON user_images
            FOR DELETE USING (auth.uid() = user_id);
        `
      });

      if (createError) {
        console.error('❌ Error creating user_images table:', createError);
        console.log('📝 You may need to create the table manually in Supabase dashboard');
        return null;
      }

      console.log('✅ user_images table created successfully');
    } else {
      console.log('✅ user_images table already exists');
    }

    console.log('🎉 User images table setup completed!');
    return true;
  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting User Images Database Setup');
  console.log('=====================================');

  try {
    await setupUserImagesTable();

    console.log('=====================================');
    console.log('🎉 Database setup completed successfully!');
    console.log('📝 Ready for tracking user images in database');
  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

main();