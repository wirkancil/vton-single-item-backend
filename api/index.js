const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

// Create Express app for serverless function
const app = express();

// Configure multer for file uploads (support multiple files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 2 // Allow up to 2 files: userImage and garmentImage
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = process.env.ALLOWED_MIME_TYPES?.split(',') ||
      ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`), false);
    }
  }
});

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://lovable.ai', 'https://vton.ai-agentic.tech', '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Load services with error handling
let supabaseServices = null;
let pixazoServices = null;
let modelServices = null;
let resultServices = null;
let storageServices = null;

try {
  supabaseServices = require('./services/supabaseService');
  console.log('✅ Supabase services loaded successfully');
  console.error('[VTON] Supabase services loaded:', {
    hasUploadImage: !!supabaseServices?.uploadImage,
    hasSupabase: !!supabaseServices?.supabase,
    keys: Object.keys(supabaseServices || {})
  });
} catch (error) {
  console.error('❌ Failed to load Supabase services:', error.message);
  console.error('[VTON] Error stack:', error.stack);
}

try {
  pixazoServices = require('./services/pixazoService');
  console.log('✅ Pixazo services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Pixazo services:', error.message);
}

try {
  modelServices = require('./services/modelService');
  console.log('✅ Model services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Model services:', error.message);
}

try {
  resultServices = require('./services/resultService');
  console.log('✅ Result services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Result services:', error.message);
}

try {
  storageServices = require('./services/storageService');
  console.log('✅ Storage services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Storage services:', error.message);
}

// Real garment data from database setup
const REAL_GARMENT_DATA = {
  id: '8c532593-713d-48b0-b03c-8cc337812f55',
  name: 'Test Garment - T-Shirt',
  category: 'top',
  brand: 'Test Brand',
  description: 'A test garment for virtual try-on with real image',
  image_url: 'https://nujfrxpgljdfxodnwnem.supabase.co/storage/v1/object/public/vton-assets/garments/8c532593-713d-48b0-b03c-8cc337812f55/germent.jpg',
  created_at: new Date().toISOString()
};

// Health check for root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VTON Backend API is running',
    version: '1.0.0-production',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel: true,
    services_loaded: {
      supabase: supabaseServices ? 'loaded' : 'failed',
      pixazo: pixazoServices ? 'loaded' : 'failed'
    },
    endpoints: {
      tryOn: '/api/try-on',
      garments: '/api/garments',
      health: '/api/health',
      webhook: '/api/webhooks/pixazo',
      models: '/api/models',
      results: '/api/results',
      storage: '/api/storage'
    }
  });
});

// Health check endpoint with real service status
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0-production',
      environment: process.env.NODE_ENV || 'production',
      services: {
        supabase: {
          status: process.env.SUPABASE_URL ? 'configured' : 'not_configured',
          message: process.env.SUPABASE_URL ? 'Supabase URL available' : 'Supabase URL not configured',
          loaded: supabaseServices ? 'yes' : 'no'
        },
        pixazo: {
          status: process.env.PIXAZO_API_KEY ? 'configured' : 'not_configured',
          message: process.env.PIXAZO_API_KEY ? 'API key available' : 'API key not configured',
          loaded: pixazoServices ? 'yes' : 'no'
        }
      },
      database: {
        garment_available: REAL_GARMENT_DATA ? 'yes' : 'no',
        connection: 'connected_to_real_data'
      }
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get real garment data
app.get('/api/garments', async (req, res) => {
  try {
    console.log('📦 Fetching garments...');

    let garments = [];

    // Try to get from database if services loaded
    if (supabaseServices && supabaseServices.getAllGarments) {
      try {
        garments = await supabaseServices.getAllGarments();
        console.log(`✅ Got ${garments.length} garments from database`);
      } catch (dbError) {
        console.warn('⚠️  Database fetch failed, using fallback:', dbError.message);
      }
    }

    // Fallback to real garment data if database fails
    if (garments.length === 0) {
      garments = [REAL_GARMENT_DATA];
      console.log('✅ Using real garment data as fallback');
    }

    res.status(200).json({
      success: true,
      data: garments,
      total: garments.length,
      pagination: {
        limit: garments.length,
        offset: 0,
        hasMore: false
      },
      timestamp: new Date().toISOString(),
      source: garments.length > 0 && supabaseServices ? 'database' : 'real_data'
    });
  } catch (error) {
    console.error('Failed to get garments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve garments',
      error: error.message
    });
  }
});

// Create new try-on session with real processing
// Support multiple file uploads: userImage and garmentImage
app.post('/api/try-on', upload.fields([
  { name: 'userImage', maxCount: 1 },
  { name: 'garmentImage', maxCount: 1 }
]), async (req, res, next) => {
  try {
    const { garmentId, userId } = req.body;
    const uploadedFiles = req.files;
    const uploadedFile = uploadedFiles?.userImage?.[0]; // Get user image from files
    const uploadedGarmentFile = uploadedFiles?.garmentImage?.[0]; // Get garment image from files

    // Validate required fields
    // Either garmentId OR garmentImage must be provided
    if (!garmentId && !uploadedGarmentFile) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: either garmentId or garmentImage must be provided',
        code: 'MISSING_FIELDS'
      });
    }

    // Check if image was provided (either as file upload or base64)
    const userImageBase64 = req.body.userImage; // For base64 JSON format
    if (!uploadedFile && !userImageBase64) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: userImage (file upload or base64)',
        code: 'MISSING_USER_IMAGE'
      });
    }

    // Generate session ID
    const sessionId = uuidv4();
    console.error(`[VTON] Creating try-on session ${sessionId} for garment ${garmentId || 'uploaded-image'}`);

    // Decode and upload user image
    let userImageUrl;
    let imageBuffer;
    let originalFileName = 'model.png';
    let fileSize = 0;
    let imagePath = '';

    try {
      // Handle both file upload and base64 formats
      if (uploadedFile) {
        // File upload via FormData
        imageBuffer = uploadedFile.buffer;
        fileSize = uploadedFile.size;
        originalFileName = uploadedFile.originalname || 'model.png';
        console.error(`[VTON] Received file upload: ${originalFileName} (${fileSize} bytes)`);
      } else if (userImageBase64) {
        // Base64 JSON format
        const base64Data = userImageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
        imageBuffer = Buffer.from(base64Data, 'base64');
        fileSize = imageBuffer.length;

        // Extract original filename if available from data URL
        if (userImageBase64.includes('filename=')) {
          const filenameMatch = userImageBase64.match(/filename=([^;]+)/);
          if (filenameMatch) {
            originalFileName = filenameMatch[1];
          }
        }
        console.error(`[VTON] Received base64 image: ${originalFileName} (${fileSize} bytes)`);
      }

      // Upload to Supabase Storage if services available
      if (supabaseServices && supabaseServices.uploadImage) {
        imagePath = `vton-sessions/${sessionId}/user-image-${Date.now()}.jpg`;
        userImageUrl = await supabaseServices.uploadImage(imagePath, imageBuffer, 'image/jpeg');
        console.error(`[VTON] User image uploaded to Supabase: ${userImageUrl}`);
      } else {
        // Fallback to mock URL
        imagePath = `vton-sessions/${sessionId}/user-image-${Date.now()}.jpg`;
        userImageUrl = `https://mock-storage.vton.ai/user-images/${sessionId}.jpg`;
        console.log(`⚠️  Using mock user image URL: ${userImageUrl}`);
      }
    } catch (uploadError) {
      console.error('Failed to process user image:', uploadError);
      // Return proper error response instead of continuing
      return res.status(500).json({
        success: false,
        message: 'Failed to process user image',
        error: uploadError.message,
        code: 'IMAGE_PROCESSING_ERROR'
      });
    }

    // Handle garment image - use uploaded garment image if provided, otherwise from database
    let garmentImageUrl;
    let garment = REAL_GARMENT_DATA;
    
    if (uploadedGarmentFile) {
      // Upload garment image if provided
      try {
        if (!supabaseServices || !supabaseServices.uploadImage) {
          throw new Error('Supabase services not available');
        }
        const garmentImagePath = `vton-sessions/${sessionId}/garment-image-${Date.now()}.jpg`;
        garmentImageUrl = await supabaseServices.uploadImage(garmentImagePath, uploadedGarmentFile.buffer, 'image/jpeg');
        console.error(`[VTON] Garment image uploaded to Supabase: ${garmentImageUrl}`);
      } catch (garmentUploadError) {
        console.error('Failed to upload garment image:', garmentUploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to process garment image',
          error: garmentUploadError.message,
          code: 'GARMENT_IMAGE_ERROR'
        });
      }
    } else if (garmentId) {
      // Get garment from database if no upload
      if (garmentId !== REAL_GARMENT_DATA.id && supabaseServices && supabaseServices.getGarmentById) {
        try {
          garment = await supabaseServices.getGarmentById(garmentId);
          garmentImageUrl = garment.image_url;
          console.error(`[VTON] Got garment from database: ${garment.name}`);
        } catch (dbError) {
          console.warn('⚠️  Using fallback garment data:', dbError.message);
          garmentImageUrl = REAL_GARMENT_DATA.image_url;
        }
      } else {
        garmentImageUrl = REAL_GARMENT_DATA.image_url;
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either garmentId or garmentImage must be provided',
        code: 'MISSING_GARMENT'
      });
    }

    // Ensure we have a garment image URL
    if (!garmentImageUrl) {
      return res.status(400).json({
        success: false,
        message: 'Garment image URL not available',
        code: 'GARMENT_IMAGE_MISSING'
      });
    }

    // Handle user_id for anonymous users
    // Database requires user_id to be valid UUID that exists in auth.users (FK constraint)
    // After running fix-anonymous-user.sql, user_id can be NULL for anonymous
    let finalUserId = userId;
    if (!finalUserId || finalUserId === 'anonymous') {
      // After migration: can use NULL
      // Before migration: will fail with FK error (handled below)
      finalUserId = null;
      console.log(`⚠️  Using NULL for anonymous user_id (requires SQL migration if FK constraint exists)`);
    }

    // Create session record (only fields that exist in database schema)
    const sessionData = {
      id: sessionId,
      user_id: finalUserId,
      garment_id: garmentId,
      original_user_image_url: userImageUrl,
      status: 'processing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
      // Note: metadata field removed - not in database schema
    };

    // Save to database (REQUIRED - no mock fallback)
    if (!supabaseServices || !supabaseServices.createTryOnSession) {
      return res.status(503).json({
        success: false,
        message: 'Database service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    try {
      await supabaseServices.createTryOnSession(sessionData);
      console.error(`[VTON] Session saved to database - sessionId: ${sessionId}`);

      // Also save user image metadata to database (optional)
      if (supabaseServices.createUserImage) {
        try {
          const imageData = {
            user_id: userId || 'anonymous',
            session_id: sessionId,
            original_filename: originalFileName,
            file_path: imagePath,
            public_url: userImageUrl,
            file_size: fileSize,
            content_type: 'image/jpeg'
          };

          const imageRecord = await supabaseServices.createUserImage(imageData);
          if (imageRecord) {
            console.log(`✅ User image metadata saved to database: ${imageRecord.id}`);
          }
        } catch (imageError) {
          // Non-critical, just log
          console.log(`⚠️  User image metadata save failed (non-critical): ${imageError.message}`);
        }
      }
    } catch (dbError) {
      console.error('❌ Failed to save session to database:', dbError.message);
      
      // Check if it's FK constraint error for anonymous user
      if (dbError.message && dbError.message.includes('foreign key constraint') && (!userId || userId === 'anonymous')) {
        return res.status(500).json({
          success: false,
          message: 'Database configuration error: Anonymous users not supported',
          error: 'Foreign key constraint requires user_id to exist in auth.users. Please run fix-anonymous-user.sql migration in Supabase.',
          code: 'FK_CONSTRAINT_ERROR',
          solution: 'Run the SQL migration in fix-anonymous-user.sql to allow anonymous sessions'
        });
      }
      
      return res.status(500).json({
        success: false,
        message: 'Failed to create session in database',
        error: dbError.message,
        code: 'DATABASE_ERROR'
      });
    }

    // Start real AI processing if Pixazo available
    if (pixazoServices && pixazoServices.submitVirtualTryOnJob) {
      // Use explicit logging for Vercel visibility
      const logMessage = `[VTON] Submitting Pixazo job (async with webhook) for session ${sessionId}`;
      console.log(logMessage);
      console.error('[VTON]', logMessage); // Also log to stderr for better visibility

      // Submit job SYNCHRONOUSLY before sending response (critical for serverless)
      // This ensures job is actually submitted before function terminates
      let jobInfo = null;
      try {
        console.log(`[VTON] Processing request - sessionId: ${sessionId}, userImageUrl: ${userImageUrl?.substring(0, 50)}..., garmentImageUrl: ${garmentImageUrl?.substring(0, 50)}...`);
        jobInfo = await processPixazoRequest(sessionId, userImageUrl, garmentImageUrl);
        const successMsg = `[VTON] Job submitted successfully - sessionId: ${sessionId}, jobId: ${jobInfo?.jobId || 'N/A'}`;
        console.log(successMsg);
        console.error('[VTON]', successMsg); // Also log to stderr
      } catch (submitError) {
        const errorMsg = `[VTON-ERROR] Job submission failed for session ${sessionId}: ${submitError.message}`;
        console.error(errorMsg);
        console.error('[VTON-ERROR]', submitError.stack); // Log stack trace
        // Update session with error
        if (supabaseServices && supabaseServices.updateTryOnSession) {
          await supabaseServices.updateTryOnSession(sessionId, {
            status: 'failed',
            error_message: submitError.message,
            updated_at: new Date().toISOString()
          });
        }
        return res.status(500).json({
          success: false,
          message: 'Failed to submit processing job',
          error: submitError.message,
          code: 'JOB_SUBMISSION_FAILED'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Try-on session created successfully. Processing started.',
        data: {
          sessionId,
          status: 'processing',
          userImageUrl,
          garmentId,
          garmentName: garment.name,
          estimatedTime: '30-60 seconds',
          createdAt: sessionData.created_at,
          processing: 'async_webhook',
          jobId: jobInfo?.jobId,
          note: 'Results will be available via webhook callback'
        }
      });
    } else if (pixazoServices && pixazoServices.performVirtualTryOn) {
      // Fallback: old polling method (if new method not available)
      console.log('🤖 Starting real AI processing (legacy polling)...');

      // Process in background (this might not work in serverless)
      processPixazoRequest(sessionId, userImageUrl, garmentImageUrl).catch(error => {
        console.error(`❌ AI processing failed for session ${sessionId}:`, error);

        // Update session with error
        if (supabaseServices && supabaseServices.updateTryOnSession) {
          supabaseServices.updateTryOnSession(sessionId, {
            status: 'failed',
            error_message: error.message,
            updated_at: new Date().toISOString()
          }).catch(updateError => {
            console.error('Failed to update session with error:', updateError);
          });
        }
      });

      res.status(200).json({
        success: true,
        message: 'Try-on session created successfully',
        data: {
          sessionId,
          status: 'processing',
          userImageUrl,
          garmentId,
          garmentName: garment.name,
          estimatedTime: '30-60 seconds',
          createdAt: sessionData.created_at,
          processing: 'real_ai_polling'
        }
      });
    } else {
      // Mock processing if Pixazo not available
      console.log('⚠️  Pixazo not available, using mock processing...');

      // Simulate processing time
      setTimeout(async () => {
        try {
          // Generate mock result
          const resultImageUrl = `https://mock-results.vton.ai/${sessionId}/result.jpg`;

          // Update session with result
          if (supabaseServices && supabaseServices.updateTryOnSession) {
            await supabaseServices.updateTryOnSession(sessionId, {
              status: 'completed',
              result_image_url: resultImageUrl,
              completed_at: new Date().toISOString()
            });
          }

          console.log(`✅ Mock processing completed for session ${sessionId}`);
        } catch (error) {
          console.error(`❌ Mock processing failed for session ${sessionId}:`, error);
        }
      }, 3000); // 3 seconds mock processing

      res.status(200).json({
        success: true,
        message: 'Try-on session created successfully',
        data: {
          sessionId,
          status: 'processing',
          userImageUrl,
          garmentId,
          garmentName: garment.name,
          estimatedTime: '3-5 seconds',
          createdAt: sessionData.created_at,
          processing: 'mock_simulation'
        }
      });
    }
  } catch (error) {
    console.error('Try-on session creation failed:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'production' 
        ? 'An error occurred while processing your request' 
        : error.message,
      code: 'INTERNAL_ERROR'
    });
  }
});

// Get session status
app.get('/api/try-on/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;

    let session = null;

    // Try to get from database (REQUIRED - no mock fallback)
    if (supabaseServices && supabaseServices.getTryOnSessionById) {
      try {
        session = await supabaseServices.getTryOnSessionById(sessionId, userId || 'anonymous');
      } catch (dbError) {
        console.error('❌ Database fetch failed:', dbError.message);
        return res.status(500).json({
          success: false,
          message: 'Failed to retrieve session from database',
          error: dbError.message,
          code: 'DATABASE_ERROR'
        });
      }
    } else {
      return res.status(503).json({
        success: false,
        message: 'Database service not available',
        code: 'SERVICE_UNAVAILABLE'
      });
    }

    // If session not found, return 404 instead of mock data
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND',
        sessionId
      });
    }
    
    // If status is still processing, return processing status
    if (session.status === 'processing' || session.status === 'queued') {
      return res.status(200).json({
        success: true,
        data: {
          sessionId: session.id,
          status: session.status,
          progress: session.progress || 0,
          userImageUrl: session.original_user_image_url,
          resultImageUrl: null, // Not ready yet
          garmentId: session.garment_id,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          completedAt: null,
          errorMessage: session.error_message
        },
        message: 'Processing in progress',
        timestamp: new Date().toISOString()
      });
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        progress: session.progress || 100,
        userImageUrl: session.original_user_image_url,
        resultImageUrl: session.result_image_url,
        garmentId: session.garment_id,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        completedAt: session.completed_at,
        errorMessage: session.error_message
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get session status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve session status',
      error: error.message
    });
  }
});

// Background AI processing function - Submit job and let webhook handle completion
async function processPixazoRequest(sessionId, userImageUrl, garmentImageUrl) {
  try {
    const logPrefix = '[VTON-Process]';
    const startMsg = `${logPrefix} Submitting Pixazo job for session ${sessionId}`;
    console.log(startMsg);
    console.error(logPrefix, startMsg); // Also log to stderr for Vercel visibility

    // Update session status to processing
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      await supabaseServices.updateTryOnSession(sessionId, {
        status: 'processing',
        updated_at: new Date().toISOString()
      });
      console.log(`${logPrefix} Session status updated to processing`);
    }

    // Submit job to Pixazo (async mode - webhook will handle completion)
    // This is better for serverless environments where background tasks may not complete
    if (pixazoServices && pixazoServices.submitVirtualTryOnJob) {
      console.log(`${logPrefix} Calling Pixazo submitVirtualTryOnJob...`);
      const jobInfo = await pixazoServices.submitVirtualTryOnJob(userImageUrl, garmentImageUrl, {
        sessionId
      });

      const successMsg = `${logPrefix} Pixazo job submitted: ${jobInfo.jobId} for session ${sessionId}`;
      const webhookMsg = `${logPrefix} Webhook URL: ${jobInfo.callbackUrl}`;
      console.log(successMsg);
      console.log(webhookMsg);
      console.error(logPrefix, successMsg); // Also log to stderr
      console.error(logPrefix, webhookMsg); // Also log to stderr

      // Store job_id in session metadata for tracking (optional - webhook uses session_id from URL)
      // For now, webhook will use session_id from callback URL query parameter
      
      return jobInfo;
    } else {
      // Fallback: try old method if new method not available
      console.log('⚠️  Using legacy polling method...');
      const resultBuffer = await pixazoServices.performVirtualTryOn(userImageUrl, garmentImageUrl, {
        sessionId,
        maxWaitTime: 600000, // 10 minutes
        pollingInterval: 10000 // 10 seconds
      });

      if (resultBuffer) {
        let resultImageUrl = null;
        if (supabaseServices && supabaseServices.uploadImage) {
          const resultImagePath = `vton-sessions/${sessionId}/result-${Date.now()}.jpg`;
          resultImageUrl = await supabaseServices.uploadImage(resultImagePath, resultBuffer, 'image/jpeg');
          
          await supabaseServices.updateTryOnSession(sessionId, {
            status: 'completed',
            result_image_url: resultImageUrl,
            completed_at: new Date().toISOString()
          });
        }
      }
    }
  } catch (error) {
    const errorMsg = `[VTON-ERROR] Failed to submit Pixazo job for session ${sessionId}: ${error.message}`;
    console.error(errorMsg);
    console.error('[VTON-ERROR]', error.stack); // Log stack trace

    // Update session with error
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      await supabaseServices.updateTryOnSession(sessionId, {
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      });
    }
    throw error; // Re-throw to be caught by caller
  }
}

// Webhook for Pixazo API
app.post('/api/webhooks/pixazo', async (req, res) => {
  try {
    // Log full webhook payload for debugging
    console.error('[VTON-Webhook] Full webhook payload:', JSON.stringify(req.body, null, 2));
    console.error('[VTON-Webhook] Query params:', JSON.stringify(req.query, null, 2));
    console.error('[VTON-Webhook] Headers:', JSON.stringify(req.headers, null, 2));

    // Pixazo may send session_id in query params (from callback URL) or in body
    const sessionId = req.query.session_id || req.body.session_id || req.body.sessionId;
    
    // Handle different webhook formats from Pixazo
    // Format 1: { job_id, status, result_image_url, error_message }
    // Format 2: { id, status, result_image_url, error }
    // Format 3: { jobId, status, resultUrl, message }
    const job_id = req.body.job_id || req.body.id || req.body.jobId;
    const status = req.body.status || req.body.state || req.body.status_code;
    const result_image_url = req.body.result_image_url || req.body.result_image_url || req.body.resultUrl || req.body.result_url;
    const error_message = req.body.error_message || req.body.error || req.body.message;

    console.error('[VTON-Webhook] Parsed values:', { 
      sessionId, 
      job_id, 
      status, 
      has_result_url: !!result_image_url,
      error_message 
    });

    // Try to find session_id if not provided
    if (!sessionId && job_id && supabaseServices && supabaseServices.getTryOnSessionByJobId) {
      try {
        const sessionData = await supabaseServices.getTryOnSessionByJobId(job_id);
        if (sessionData && sessionData.id) {
          console.error(`[VTON-Webhook] Found session ${sessionData.id} for job ${job_id}`);
          // Use the found session ID
          const foundSessionId = sessionData.id;
          
          // Continue with found session ID
          if (!status) {
            console.error('[VTON-Webhook] ⚠️  Webhook received without status, attempting to check job status');
            // Try to get status from Pixazo API
            if (pixazoServices && pixazoServices.checkJobStatus && job_id) {
              try {
                const jobStatus = await pixazoServices.checkJobStatus(job_id);
                console.error('[VTON-Webhook] Job status from API:', jobStatus);
                // Process webhook with job status data
                // Recursively call this handler logic with the status data
                req.body.status = jobStatus.status || jobStatus.state;
                req.body.result_image_url = jobStatus.result_image_url || jobStatus.result_url;
                return await handleWebhookWithSessionId(foundSessionId, req, res);
              } catch (statusError) {
                console.error('[VTON-Webhook] Failed to check job status:', statusError);
              }
            }
            return res.status(400).json({
              success: false,
              message: 'Missing status in webhook and unable to fetch from API'
            });
          }
          
          return await handleWebhookWithSessionId(foundSessionId, req, res);
        }
      } catch (lookupError) {
        console.error('[VTON-Webhook] Failed to lookup session by job_id:', lookupError);
      }
    }

    if (!sessionId) {
      console.error('[VTON-Webhook] ⚠️  Webhook received without session_id and unable to find by job_id');
      // Still process if we have job_id - we'll update by job_id later
      if (job_id) {
        console.error('[VTON-Webhook] Processing with job_id only:', job_id);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Missing session_id in webhook and no job_id provided'
        });
      }
    }

    if (!status) {
      console.error('[VTON-Webhook] ⚠️  Webhook received without status');
      return res.status(400).json({
        success: false,
        message: 'Missing status in webhook'
      });
    }

    // Process webhook with session ID
    return await handleWebhookWithSessionId(sessionId, req, res);
  } catch (error) {
    console.error('[VTON-Webhook] ❌ Failed to process webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
      error: error.message
    });
  }
});

// Helper function to handle webhook processing with session ID
async function handleWebhookWithSessionId(sessionId, req, res) {
  try {
    const status = req.body.status || req.body.state || req.body.status_code;
    const result_image_url = req.body.result_image_url || req.body.resultUrl || req.body.result_url;
    const error_message = req.body.error_message || req.body.error || req.body.message;

    console.error(`[VTON-Webhook] Processing webhook for session ${sessionId} with status: ${status}`);

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Handle different statuses
    if (status === 'completed' || status === 'success') {
      updateData.status = 'completed';
      
      if (result_image_url) {
        // Download result image and upload to Supabase Storage
        try {
          const axios = require('axios');
          const imageResponse = await axios.get(result_image_url, {
            responseType: 'arraybuffer',
            timeout: 60000
          });

          const resultBuffer = Buffer.from(imageResponse.data);
          
          if (supabaseServices && supabaseServices.uploadImage) {
            const resultImagePath = `vton-sessions/${sessionId}/result-${Date.now()}.jpg`;
            const finalResultUrl = await supabaseServices.uploadImage(resultImagePath, resultBuffer, 'image/jpeg');
            updateData.result_image_url = finalResultUrl;
            console.error(`[VTON-Webhook] ✅ Result image uploaded to Supabase: ${finalResultUrl}`);
          } else {
            // Fallback: use Pixazo URL directly if upload fails
            updateData.result_image_url = result_image_url;
            console.error('[VTON-Webhook] ⚠️  Supabase upload not available, using Pixazo URL directly');
          }
        } catch (downloadError) {
          console.error('[VTON-Webhook] ❌ Failed to download/upload result image:', downloadError);
          // Still mark as completed but log error
          updateData.error_message = `Failed to process result image: ${downloadError.message}`;
        }

      } else {
        updateData.status = 'failed';
        updateData.error_message = 'Job completed but no result image URL provided';
      }

      updateData.completed_at = new Date().toISOString();

    } else if (status === 'failed' || status === 'error') {
      updateData.status = 'failed';
      updateData.error_message = error_message || 'Job failed with unknown error';

    } else {
      // Processing or other status
      updateData.status = status === 'processing' ? 'processing' : 'queued';
    }

    // Update session in database
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      await supabaseServices.updateTryOnSession(sessionId, updateData);
      console.error(`[VTON-Webhook] ✅ Updated session ${sessionId} with status: ${updateData.status}`);
    } else {
      console.error('[VTON-Webhook] ❌ Supabase service not available');
      return res.status(503).json({
        success: false,
        message: 'Database service not available'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      processed_at: new Date().toISOString(),
      session_id: sessionId,
      status: updateData.status
    });
  } catch (error) {
    console.error(`[VTON-Webhook] ❌ Error handling webhook for session ${sessionId}:`, error);
    throw error;
  }
}

// =============================================
// MODEL MANAGEMENT ROUTES
// =============================================

// Create face model (requires file upload)
app.post('/api/models/faces', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');
    const { authenticateToken } = require('./middleware/authMiddleware');

    // Mock authentication for now - replace with actual middleware
    req.user = { id: req.body.userId || 'anonymous' };

    // Simulate file upload handling
    if (req.body.userImage) {
      const base64Data = req.body.userImage.replace(/^data:image\/[a-z]+;base64,/, '');
      req.file = { buffer: Buffer.from(base64Data, 'base64'), mimetype: 'image/jpeg' };
    }

    return await modelController.createFaceModel(req, res);
  } catch (error) {
    console.error('Create face model error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create face model',
      error: error.message
    });
  }
});

// Get user face models
app.get('/api/models/faces', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await modelController.getUserFaceModels(req, res);
  } catch (error) {
    console.error('Get face models error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get face models',
      error: error.message
    });
  }
});

// Update face model
app.put('/api/models/faces/:modelId', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await modelController.updateFaceModel(req, res);
  } catch (error) {
    console.error('Update face model error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update face model',
      error: error.message
    });
  }
});

// Delete face model
app.delete('/api/models/faces/:modelId', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await modelController.deleteFaceModel(req, res);
  } catch (error) {
    console.error('Delete face model error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete face model',
      error: error.message
    });
  }
});

// Create size profile
app.post('/api/models/size-profiles', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await modelController.createSizeProfile(req, res);
  } catch (error) {
    console.error('Create size profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create size profile',
      error: error.message
    });
  }
});

// Get user size profiles
app.get('/api/models/size-profiles', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await modelController.getUserSizeProfiles(req, res);
  } catch (error) {
    console.error('Get size profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get size profiles',
      error: error.message
    });
  }
});

// Update size profile
app.put('/api/models/size-profiles/:profileId', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await modelController.updateSizeProfile(req, res);
  } catch (error) {
    console.error('Update size profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update size profile',
      error: error.message
    });
  }
});

// Delete size profile
app.delete('/api/models/size-profiles/:profileId', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await modelController.deleteSizeProfile(req, res);
  } catch (error) {
    console.error('Delete size profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete size profile',
      error: error.message
    });
  }
});

// Get user model analytics
app.get('/api/models/analytics', async (req, res) => {
  try {
    const modelController = require('./controllers/modelController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await modelController.getUserModelAnalytics(req, res);
  } catch (error) {
    console.error('Get model analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get model analytics',
      error: error.message
    });
  }
});

// =============================================
// RESULT MANAGEMENT ROUTES
// =============================================

// Get user result gallery
app.get('/api/results/gallery', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await resultController.getUserResultGallery(req, res);
  } catch (error) {
    console.error('Get result gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get result gallery',
      error: error.message
    });
  }
});

// Get shared result (public access)
app.get('/api/results/shared/:shareToken', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    return await resultController.getResultByShareToken(req, res);
  } catch (error) {
    console.error('Get shared result error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get shared result',
      error: error.message
    });
  }
});

// Get specific result details
app.get('/api/results/:sessionId', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await resultController.getResultDetails(req, res);
  } catch (error) {
    console.error('Get result details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get result details',
      error: error.message
    });
  }
});

// Update result analytics
app.put('/api/results/:sessionId', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await resultController.updateResultAnalytics(req, res);
  } catch (error) {
    console.error('Update result analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update result analytics',
      error: error.message
    });
  }
});

// Toggle favorite status
app.put('/api/results/:sessionId/favorite', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await resultController.toggleFavorite(req, res);
  } catch (error) {
    console.error('Toggle favorite error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle favorite status',
      error: error.message
    });
  }
});

// Create share for result
app.post('/api/results/:sessionId/share', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await resultController.createShare(req, res);
  } catch (error) {
    console.error('Create share error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create share',
      error: error.message
    });
  }
});

// Get user result analytics
app.get('/api/results/analytics', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await resultController.getUserResultAnalytics(req, res);
  } catch (error) {
    console.error('Get result analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get result analytics',
      error: error.message
    });
  }
});

// Delete result
app.delete('/api/results/:sessionId', async (req, res) => {
  try {
    const resultController = require('./controllers/resultController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await resultController.deleteResultAnalytics(req, res);
  } catch (error) {
    console.error('Delete result error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete result',
      error: error.message
    });
  }
});

// =============================================
// STORAGE MANAGEMENT ROUTES
// =============================================

// Get user storage usage
app.get('/api/storage/usage', async (req, res) => {
  try {
    const storageController = require('./controllers/storageController');

    // Mock authentication
    req.user = { id: req.query.userId || 'anonymous' };

    return await storageController.getUserStorageUsage(req, res);
  } catch (error) {
    console.error('Get storage usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get storage usage',
      error: error.message
    });
  }
});

// Cleanup old files
app.post('/api/storage/cleanup', async (req, res) => {
  try {
    const storageController = require('./controllers/storageController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await storageController.cleanupOldFiles(req, res);
  } catch (error) {
    console.error('Cleanup storage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup storage',
      error: error.message
    });
  }
});

// Optimize storage
app.post('/api/storage/optimize', async (req, res) => {
  try {
    const storageController = require('./controllers/storageController');

    // Mock authentication
    req.user = { id: req.body.userId || 'anonymous' };

    return await storageController.optimizeStorage(req, res);
  } catch (error) {
    console.error('Optimize storage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize storage',
      error: error.message
    });
  }
});

// Get global storage stats (admin only)
app.get('/api/storage/global-stats', async (req, res) => {
  try {
    const storageController = require('./controllers/storageController');

    // Mock admin authentication
    req.user = { id: 'admin', email: 'admin@admin.com' };

    return await storageController.getGlobalStorageStats(req, res);
  } catch (error) {
    console.error('Get global storage stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get global storage stats',
      error: error.message
    });
  }
});

// Get bucket info (admin only)
app.get('/api/storage/buckets', async (req, res) => {
  try {
    const storageController = require('./controllers/storageController');

    // Mock admin authentication
    req.user = { id: 'admin', email: 'admin@admin.com' };

    return await storageController.getBucketInfo(req, res);
  } catch (error) {
    console.error('Get bucket info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bucket info',
      error: error.message
    });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    code: 'NOT_FOUND',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/garments',
      'POST /api/try-on',
      'GET /api/try-on/:sessionId/status',
      'POST /api/webhooks/pixazo',
      '',
      '=== MODEL MANAGEMENT ===',
      'POST /api/models/faces',
      'GET /api/models/faces',
      'PUT /api/models/faces/:modelId',
      'DELETE /api/models/faces/:modelId',
      'POST /api/models/size-profiles',
      'GET /api/models/size-profiles',
      'PUT /api/models/size-profiles/:profileId',
      'DELETE /api/models/size-profiles/:profileId',
      'GET /api/models/analytics',
      '',
      '=== RESULT MANAGEMENT ===',
      'GET /api/results/gallery',
      'GET /api/results/shared/:shareToken',
      'GET /api/results/:sessionId',
      'PUT /api/results/:sessionId',
      'PUT /api/results/:sessionId/favorite',
      'POST /api/results/:sessionId/share',
      'GET /api/results/analytics',
      'DELETE /api/results/:sessionId',
      '',
      '=== STORAGE MANAGEMENT ===',
      'GET /api/storage/usage',
      'POST /api/storage/cleanup',
      'POST /api/storage/optimize',
      'GET /api/storage/global-stats (admin)',
      'GET /api/storage/buckets (admin)'
    ]
  });
});

// Global error handler (must be last)
app.use((error, req, res, next) => {
  // Handle multer errors
  if (error instanceof multer.MulterError) {
    let message = 'File upload error';
    let code = 'UPLOAD_ERROR';

    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size: ${process.env.MAX_FILE_SIZE || '10MB'}`;
        code = 'FILE_TOO_LARGE';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        code = 'TOO_MANY_FILES';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        code = 'UNEXPECTED_FILE';
        break;
      default:
        message = error.message;
    }

    return res.status(400).json({
      success: false,
      message,
      code,
      timestamp: new Date().toISOString()
    });
  }

  // Handle file filter errors
  if (error.message && error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'INVALID_FILE_TYPE',
      timestamp: new Date().toISOString()
    });
  }

  // Handle other errors
  console.error('API Error:', error);
  const statusCode = error.statusCode || error.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  res.status(statusCode).json({
    success: false,
    message,
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error.message
    })
  });
});

// Export the Express app for Vercel
module.exports = app;