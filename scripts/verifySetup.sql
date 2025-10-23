-- =============================================
-- VTON SETUP VERIFICATION SCRIPT
-- Run this after completing the setup to verify everything works
-- =============================================

-- Initialize verification counter
DO $$
DECLARE
    verification_count INTEGER := 0;
    error_count INTEGER := 0;
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VTON DATABASE SETUP VERIFICATION';
    RAISE NOTICE '========================================';

    -- 1. Verify Tables Exist
    RAISE NOTICE '';
    RAISE NOTICE '1. VERIFYING TABLES...';

    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'garments') THEN
        RAISE NOTICE '✓ garments table exists';
        verification_count := verification_count + 1;
    ELSE
        RAISE NOTICE '✗ garments table missing';
        error_count := error_count + 1;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'try_on_history') THEN
        RAISE NOTICE '✓ try_on_history table exists';
        verification_count := verification_count + 1;
    ELSE
        RAISE NOTICE '✗ try_on_history table missing';
        error_count := error_count + 1;
    END IF;

    -- 2. Verify Indexes
    RAISE NOTICE '';
    RAISE NOTICE '2. VERIFYING INDEXES...';

    DECLARE
        garment_indexes INTEGER;
        history_indexes INTEGER;
    BEGIN
        SELECT COUNT(*) INTO garment_indexes
        FROM pg_indexes
        WHERE tablename = 'garments' AND indexname LIKE 'idx_garments_%';

        IF garment_indexes = 4 THEN
            RAISE NOTICE '✓ garments indexes created (4/4)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ garments indexes incomplete (%/4)', garment_indexes;
            error_count := error_count + 1;
        END IF;

        SELECT COUNT(*) INTO history_indexes
        FROM pg_indexes
        WHERE tablename = 'try_on_history' AND indexname LIKE 'idx_try_on_history_%';

        IF history_indexes = 5 THEN
            RAISE NOTICE '✓ try_on_history indexes created (5/5)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ try_on_history indexes incomplete (%/5)', history_indexes;
            error_count := error_count + 1;
        END IF;
    END;

    -- 3. Verify RLS
    RAISE NOTICE '';
    RAISE NOTICE '3. VERIFYING ROW LEVEL SECURITY...';

    DECLARE
        rls_enabled BOOLEAN;
        policy_count INTEGER;
    BEGIN
        SELECT rowsecurity INTO rls_enabled
        FROM pg_tables
        WHERE tablename = 'try_on_history';

        IF rls_enabled THEN
            RAISE NOTICE '✓ RLS enabled on try_on_history';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ RLS not enabled on try_on_history';
            error_count := error_count + 1;
        END IF;

        SELECT COUNT(*) INTO policy_count
        FROM pg_policies
        WHERE tablename = 'try_on_history';

        IF policy_count = 4 THEN
            RAISE NOTICE '✓ RLS policies created (4/4)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ RLS policies incomplete (%/4)', policy_count;
            error_count := error_count + 1;
        END IF;
    END;

    -- 4. Verify Functions
    RAISE NOTICE '';
    RAISE NOTICE '4. VERIFYING FUNCTIONS...';

    DECLARE
        function_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO function_count
        FROM information_schema.routines
        WHERE routine_name IN (
            'update_updated_at_column',
            'update_processing_timestamps',
            'cleanup_old_failed_sessions',
            'get_user_active_sessions'
        );

        IF function_count = 4 THEN
            RAISE NOTICE '✓ Database functions created (4/4)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ Database functions incomplete (%/4)', function_count;
            error_count := error_count + 1;
        END IF;
    END;

    -- 5. Verify Views
    RAISE NOTICE '';
    RAISE NOTICE '5. VERIFYING VIEWS...';

    DECLARE
        view_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO view_count
        FROM information_schema.views
        WHERE table_name IN ('user_try_on_history', 'active_garments', 'try_on_statistics');

        IF view_count = 3 THEN
            RAISE NOTICE '✓ Database views created (3/3)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ Database views incomplete (%/3)', view_count;
            error_count := error_count + 1;
        END IF;
    END;

    -- 6. Verify Triggers
    RAISE NOTICE '';
    RAISE NOTICE '6. VERIFYING TRIGGERS...';

    DECLARE
        trigger_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO trigger_count
        FROM information_schema.triggers
        WHERE trigger_name IN (
            'update_garments_updated_at',
            'update_try_on_history_updated_at',
            'update_processing_timestamps_trigger'
        );

        IF trigger_count = 3 THEN
            RAISE NOTICE '✓ Database triggers created (3/3)';
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ Database triggers incomplete (%/3)', trigger_count;
            error_count := error_count + 1;
        END IF;
    END;

    -- 7. Verify Sample Data
    RAISE NOTICE '';
    RAISE NOTICE '7. VERIFYING SAMPLE DATA...';

    DECLARE
        garment_count INTEGER;
    BEGIN
        SELECT COUNT(*) INTO garment_count FROM garments;

        IF garment_count >= 5 THEN
            RAISE NOTICE '✓ Sample garments inserted (%)', garment_count;
            verification_count := verification_count + 1;
        ELSE
            RAISE NOTICE '✗ Sample garments missing (%/5)', garment_count;
            error_count := error_count + 1;
        END IF;
    END;

    -- 8. Verify Storage Bucket (if exists)
    RAISE NOTICE '';
    RAISE NOTICE '8. VERIFYING STORAGE SETUP...';

    BEGIN
        IF EXISTS (SELECT 1 FROM storage.buckets WHERE name = 'vton-assets') THEN
            RAISE NOTICE '✓ vton-assets storage bucket exists';
            verification_count := verification_count + 1;

            -- Check storage policies
            DECLARE
                policy_count INTEGER;
            BEGIN
                SELECT COUNT(*) INTO policy_count
                FROM storage.policies
                WHERE bucket_id = (SELECT id FROM storage.buckets WHERE name = 'vton-assets');

                IF policy_count >= 3 THEN
                    RAISE NOTICE '✓ Storage policies created (%)', policy_count;
                    verification_count := verification_count + 1;
                ELSE
                    RAISE NOTICE '⚠ Storage policies incomplete (%/3)', policy_count;
                    RAISE NOTICE '  Run setupStorage.sql to complete storage setup';
                END IF;
            END;
        ELSE
            RAISE NOTICE '⚠ vton-assets storage bucket not created';
            RAISE NOTICE '  Create bucket via Supabase Dashboard Storage section';
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠ Cannot verify storage (storage schema may not exist)';
        RAISE NOTICE '  Create bucket via Supabase Dashboard Storage section';
    END;

    -- Summary
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'VERIFICATION SUMMARY';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Checks passed: %', verification_count;
    RAISE NOTICE 'Checks failed: %', error_count;

    IF error_count = 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '🎉 SETUP VERIFICATION SUCCESSFUL!';
        RAISE NOTICE 'Your VTON database is ready for use.';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '❌ SETUP VERIFICATION FAILED!';
        RAISE NOTICE 'Please address the errors above before proceeding.';
    END IF;

    RAISE NOTICE '========================================';
END $$;

-- Test basic functionality
RAISE NOTICE '';
RAISE NOTICE '9. TESTING BASIC FUNCTIONALITY...';

-- Test garments table
BEGIN
    PERFORM 1 FROM garments LIMIT 1;
    RAISE NOTICE '✓ garments table accessible';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ garments table not accessible';
END;

-- Test views
BEGIN
    PERFORM 1 FROM active_garments LIMIT 1;
    RAISE NOTICE '✓ active_garments view working';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '✗ active_garments view not working';
END;

-- Test functions (non-authenticated)
BEGIN
    SELECT cleanup_old_failed_sessions(0) INTO 1;
    RAISE NOTICE '✓ cleanup_old_failed_sessions function working';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '⚠ cleanup_old_failed_sessions function requires permissions';
END;

-- Final status
RAISE NOTICE '';
RAISE NOTICE 'VERIFICATION COMPLETE';