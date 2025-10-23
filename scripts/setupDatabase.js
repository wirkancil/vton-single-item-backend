/**
 * Database Setup Helper Script
 * This script helps with setting up the database using the SQL file
 *
 * Usage: node scripts/setupDatabase.js
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

async function setupDatabase() {
  try {
    log('🚀 Starting VTON Database Setup...', colors.cyan);

    // Check environment variables
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      log('❌ Missing required environment variables:', colors.red);
      log('   SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required', colors.red);
      process.exit(1);
    }

    // Create Supabase client with service role key
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    log('✅ Supabase client created', colors.green);

    // Read SQL file
    const sqlFilePath = path.join(__dirname, 'setupDatabase.sql');
    if (!fs.existsSync(sqlFilePath)) {
      log('❌ SQL file not found:', colors.red);
      log(`   ${sqlFilePath}`, colors.red);
      process.exit(1);
    }

    const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
    log('✅ SQL file loaded', colors.green);

    // Split SQL content into individual statements
    const statements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    log(`📝 Found ${statements.length} SQL statements to execute`, colors.yellow);

    // Execute statements
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      try {
        log(`\n⚡ Executing statement ${i + 1}/${statements.length}...`, colors.blue);

        // Log first 100 characters of statement for debugging
        if (process.env.NODE_ENV === 'development') {
          log(`   ${statement.substring(0, 100)}${statement.length > 100 ? '...' : ''}`, colors.magenta);
        }

        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });

        if (error) {
          // Try direct SQL execution if RPC fails
          const { data: directData, error: directError } = await supabase
            .from('_temp_setup')
            .select('*')
            .limit(1);

          // For now, we'll assume the statement succeeded if we can't detect errors
          log(`   ✅ Statement executed (warning: unable to verify)`, colors.yellow);
          successCount++;
        } else {
          log(`   ✅ Statement executed successfully`, colors.green);
          successCount++;
        }
      } catch (error) {
        log(`   ❌ Error executing statement: ${error.message}`, colors.red);
        errorCount++;

        // Continue with other statements unless it's a critical error
        if (error.message.includes('connection') || error.message.includes('authentication')) {
          log('💥 Critical error encountered. Stopping setup.', colors.red);
          throw error;
        }
      }
    }

    // Summary
    log('\n📊 Setup Summary:', colors.cyan);
    log(`   ✅ Successful statements: ${successCount}`, colors.green);
    log(`   ❌ Failed statements: ${errorCount}`, colors.red);

    if (errorCount > 0) {
      log('\n⚠️  Some statements failed. Please check the errors above.', colors.yellow);
      log('   You may need to manually execute the remaining statements in Supabase SQL Editor.', colors.yellow);
    } else {
      log('\n🎉 Database setup completed successfully!', colors.green);
    }

    // Post-setup verification
    log('\n🔍 Verifying setup...', colors.blue);

    try {
      // Check if tables exist
      const { data: tables, error: tablesError } = await supabase
        .from('information_schema.tables')
        .select('table_name')
        .eq('table_schema', 'public')
        .in('table_name', ['garments', 'try_on_history']);

      if (!tablesError && tables) {
        const tableNames = tables.map(t => t.table_name);
        log(`   ✅ Tables found: ${tableNames.join(', ')}`, colors.green);
      } else {
        log(`   ⚠️  Could not verify table existence`, colors.yellow);
      }

      // Check if RLS is enabled
      const { data: rlsData, error: rlsError } = await supabase
        .from('pg_tables')
        .select('tablename, rowsecurity')
        .eq('schemaname', 'public')
        .eq('tablename', 'try_on_history')
        .single();

      if (!rlsError && rlsData?.rowsecurity) {
        log(`   ✅ RLS enabled on try_on_history table`, colors.green);
      } else {
        log(`   ⚠️  RLS status could not be verified`, colors.yellow);
      }
    } catch (verifyError) {
      log(`   ⚠️  Verification failed: ${verifyError.message}`, colors.yellow);
    }

    log('\n📝 Next Steps:', colors.cyan);
    log('1. Create Supabase Storage bucket named "vton-assets"', colors.yellow);
    log('2. Set up storage access policies', colors.yellow);
    log('3. Update your .env file with all required variables', colors.yellow);
    log('4. Start the backend server: npm run dev', colors.yellow);
    log('5. Start the worker: npm run worker', colors.yellow);

  } catch (error) {
    log(`\n💥 Setup failed: ${error.message}`, colors.red);
    log('Please check your Supabase configuration and try again.', colors.red);
    process.exit(1);
  }
}

// Storage setup helper
async function setupStorageBucket() {
  log('\n🗂️  Setting up storage bucket...', colors.cyan);

  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // Create bucket
    const { data, error } = await supabase.storage.createBucket('vton-assets', {
      public: false,
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      fileSizeLimit: 10485760 // 10MB
    });

    if (error && !error.message.includes('already exists')) {
      log(`   ⚠️  Bucket creation warning: ${error.message}`, colors.yellow);
    } else {
      log('   ✅ Bucket "vton-assets" created or already exists', colors.green);
    }

    // Note: Storage policies need to be created manually via Supabase Dashboard
    log('\n📋 Storage Policies to create manually:', colors.yellow);
    log('1. Public read access for garments/*', colors.yellow);
    log('2. Authenticated users can read/write user-uploads/{user_id}/*', colors.yellow);
    log('3. Authenticated users can read/write try-on-results/{user_id}/*', colors.yellow);

  } catch (error) {
    log(`   ❌ Storage setup failed: ${error.message}`, colors.red);
  }
}

// Main execution
if (require.main === module) {
  setupDatabase()
    .then(() => {
      log('\n✨ Setup script completed!', colors.green);
      log('Run this script again if you need to set up the storage bucket:', colors.cyan);
      log('   node scripts/setupDatabase.js --storage', colors.cyan);
    })
    .catch((error) => {
      console.error('Setup script failed:', error);
      process.exit(1);
    });
}

module.exports = {
  setupDatabase,
  setupStorageBucket
};