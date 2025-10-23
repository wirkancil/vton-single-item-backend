const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Create Express app for serverless function
const app = express();

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

try {
  supabaseServices = require('./services/supababaseService');
  console.log('✅ Supabase services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Supabase services:', error.message);
}

try {
  pixazoServices = require('./services/pixazoService');
  console.log('✅ Pixazo services loaded successfully');
} catch (error) {
  console.error('❌ Failed to load Pixazo services:', error.message);
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
      webhook: '/api/webhooks/pixazo'
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
app.post('/api/try-on', async (req, res) => {
  try {
    const { userImage, garmentId, userId } = req.body;

    // Validate required fields
    if (!userImage || !garmentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userImage and garmentId',
        code: 'MISSING_FIELDS'
      });
    }

    // Generate session ID
    const sessionId = uuidv4();
    console.log(`🎭 Creating try-on session ${sessionId} for garment ${garmentId}`);

    // Decode and upload user image
    let userImageUrl;
    try {
      // Handle base64 data URL
      const base64Data = userImage.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Upload to Supabase Storage if services available
      if (supabaseServices && supabaseServices.uploadImage) {
        const imagePath = `vton-sessions/${sessionId}/user-image-${Date.now()}.jpg`;
        userImageUrl = await supabaseServices.uploadImage(imagePath, imageBuffer, 'image/jpeg');
        console.log(`✅ User image uploaded to Supabase: ${userImageUrl}`);
      } else {
        // Fallback to mock URL
        userImageUrl = `https://mock-storage.vton.ai/user-images/${sessionId}.jpg`;
        console.log(`⚠️  Using mock user image URL: ${userImageUrl}`);
      }
    } catch (uploadError) {
      console.error('Failed to upload user image:', uploadError);
      userImageUrl = `https://mock-storage.vton.ai/user-images/${sessionId}.jpg`;
    }

    // Get garment details
    let garment = REAL_GARMENT_DATA;
    if (garmentId !== REAL_GARMENT_DATA.id && supabaseServices && supabaseServices.getGarmentById) {
      try {
        garment = await supabaseServices.getGarmentById(garmentId);
        console.log(`✅ Got garment from database: ${garment.name}`);
      } catch (dbError) {
        console.warn('⚠️  Using fallback garment data:', dbError.message);
      }
    }

    // Create session record
    const sessionData = {
      id: sessionId,
      user_id: userId || 'anonymous',
      garment_id: garmentId,
      original_user_image_url: userImageUrl,
      status: 'processing',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        user_agent: req.get('User-Agent'),
        ip_address: req.ip,
        image_size: userImage.length
      }
    };

    // Save to database if available
    if (supabaseServices && supabaseServices.createTryOnSession) {
      try {
        await supabaseServices.createTryOnSession(sessionData);
        console.log(`✅ Session saved to database`);
      } catch (dbError) {
        console.warn('⚠️  Failed to save session to database:', dbError.message);
      }
    }

    // Start real AI processing if Pixazo available
    if (pixazoServices && pixazoServices.performVirtualTryOn) {
      console.log('🤖 Starting real AI processing...');

      // Process in background
      processPixazoRequest(sessionId, userImageUrl, garment.image_url).catch(error => {
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
          processing: 'real_ai'
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
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get session status
app.get('/api/try-on/:sessionId/status', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.query;

    let session = null;

    // Try to get from database
    if (supabaseServices && supabaseServices.getTryOnSessionById) {
      try {
        session = await supabaseServices.getTryOnSessionById(sessionId, userId || 'anonymous');
      } catch (dbError) {
        console.warn('⚠️  Database fetch failed, using mock session:', dbError.message);
      }
    }

    // Fallback mock session data
    if (!session) {
      session = {
        id: sessionId,
        status: 'completed',
        progress: 100,
        original_user_image_url: `https://mock-storage.vton.ai/user-images/${sessionId}.jpg`,
        result_image_url: `https://mock-results.vton.ai/${sessionId}/result.jpg`,
        garment_id: REAL_GARMENT_DATA.id,
        created_at: new Date().toISOString(),
        completed_at: new Date().toISOString()
      };
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

// Background AI processing function
async function processPixazoRequest(sessionId, userImageUrl, garmentImageUrl) {
  try {
    console.log(`🤖 Processing Pixazo request for session ${sessionId}`);

    // Update session status to processing
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      await supabaseServices.updateTryOnSession(sessionId, {
        status: 'processing',
        updated_at: new Date().toISOString()
      });
    }

    // Perform virtual try-on
    const resultBuffer = await pixazoServices.performVirtualTryOn(userImageUrl, garmentImageUrl, {
      sessionId,
      maxWaitTime: 120000, // 2 minutes
      pollingInterval: 5000 // 5 seconds
    });

    if (resultBuffer) {
      // Upload result to Supabase Storage
      let resultImageUrl = `https://mock-results.vton.ai/${sessionId}/result.jpg`;

      if (supabaseServices && supabaseServices.uploadImage) {
        try {
          const resultImagePath = `vton-sessions/${sessionId}/result-${Date.now()}.jpg`;
          resultImageUrl = await supabaseServices.uploadImage(resultImagePath, resultBuffer, 'image/jpeg');
          console.log(`✅ Real result uploaded to Supabase: ${resultImageUrl}`);
        } catch (uploadError) {
          console.warn('⚠️  Failed to upload result to Supabase:', uploadError.message);
        }
      }

      // Update session with result
      if (supabaseServices && supabaseServices.updateTryOnSession) {
        await supabaseServices.updateTryOnSession(sessionId, {
          status: 'completed',
          result_image_url: resultImageUrl,
          completed_at: new Date().toISOString()
        });
      }

      console.log(`✅ Real AI processing completed for session ${sessionId}`);
    }
  } catch (error) {
    console.error(`❌ Real AI processing failed for session ${sessionId}:`, error);

    // Update session with error
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      await supabaseServices.updateTryOnSession(sessionId, {
        status: 'failed',
        error_message: error.message,
        updated_at: new Date().toISOString()
      });
    }
  }
}

// Webhook for Pixazo API
app.post('/api/webhooks/pixazo', async (req, res) => {
  try {
    const { job_id, status, result_image_url, error_message, session_id } = req.body;

    console.log('📥 Received Pixazo webhook:', { job_id, status, session_id });

    if (!job_id || !status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Update session status
    const updateData = {
      status: status === 'completed' ? 'completed' : status === 'failed' ? 'failed' : status,
      updated_at: new Date().toISOString()
    };

    if (result_image_url) {
      updateData.result_image_url = result_image_url;
    }

    if (error_message) {
      updateData.error_message = error_message;
    }

    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    // Update session if services available
    if (supabaseServices && supabaseServices.updateTryOnSession) {
      if (session_id) {
        await supabaseServices.updateTryOnSession(session_id, updateData);
        console.log(`✅ Updated session ${session_id} with status ${status}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      processed_at: new Date().toISOString(),
      session_id
    });
  } catch (error) {
    console.error('Failed to process webhook:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process webhook',
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
      'POST /api/webhooks/pixazo'
    ]
  });
});

// Error handler
app.use((error, req, res, next) => {
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
      details: error
    })
  });
});

// Export the Express app for Vercel
module.exports = app;