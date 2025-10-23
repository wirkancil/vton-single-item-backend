const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { supabase, uploadImage, getAllGarments, createTryOnSession, updateTryOnSession, getTryOnSessionById, getUserTryOnHistory, deleteTryOnSession } = require('../services/supabaseService');
const { performVirtualTryOn, checkApiHealth } = require('../services/pixazoService');

// Create Express app for serverless function
const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://lovable.ai', 'https://vton.ai-agentic.tech'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Middleware for JSON parsing and large payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check for root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VTON Backend API is running',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    endpoints: {
      tryOn: '/api/try-on',
      garments: '/api/garments',
      health: '/api/health',
      webhook: '/api/webhooks/pixazo'
    }
  });
});

// Health check endpoint with services status
app.get('/api/health', async (req, res) => {
  try {
    // Check Supabase health
    const supabaseHealth = await checkApiHealth();

    // Get garments count to verify database access
    const garmentsCount = await getAllGarments({ limit: 1 });

    const healthStatus = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      services: {
        supabase: {
          status: supabaseHealth.healthy ? 'healthy' : 'unhealthy',
          message: supabaseHealth.message
        },
        pixazo: {
          status: process.env.PIXAZO_API_KEY ? 'configured' : 'not_configured',
          message: process.env.PIXAZO_API_KEY ? 'API key available' : 'API key not configured'
        }
      },
      database: {
        garments_available: garmentsCount.length,
        connection: garmentsCount.length > 0 ? 'connected' : 'no_data'
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

// Get all available garments
app.get('/api/garments', async (req, res) => {
  try {
    const { category, brand, limit = 50, offset = 0 } = req.query;

    const options = {
      category,
      brand,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const garments = await getAllGarments(options);

    res.status(200).json({
      success: true,
      data: garments,
      total: garments.length,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: garments.length === options.limit
      },
      timestamp: new Date().toISOString()
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

// Create new try-on session
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

    // Decode and upload user image
    let userImageUrl;
    try {
      // Handle base64 data URL
      const base64Data = userImage.replace(/^data:image\/[a-z]+;base64,/, '');
      const imageBuffer = Buffer.from(base64Data, 'base64');

      // Upload to Supabase Storage
      const imagePath = `try-on-sessions/${sessionId}/user-image-${Date.now()}.jpg`;
      userImageUrl = await uploadImage(imagePath, imageBuffer, 'image/jpeg');

      console.log(`User image uploaded: ${userImageUrl}`);
    } catch (uploadError) {
      console.error('Failed to upload user image:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Failed to process user image',
        error: uploadError.message
      });
    }

    // Create session record in database
    try {
      const sessionData = {
        id: sessionId,
        user_id: userId || 'anonymous',
        garment_id: garmentId,
        original_user_image_url: userImageUrl,
        status: 'queued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          user_agent: req.get('User-Agent'),
          ip_address: req.ip,
          image_size: userImage.length
        }
      };

      const session = await createTryOnSession(sessionData);

      // Submit to Pixazo API for processing (in background)
      processPixazoRequest(sessionId, userImageUrl, garmentId).catch(error => {
        console.error(`Failed to process Pixazo request for session ${sessionId}:`, error);
        // Update session status to failed
        updateTryOnSession(sessionId, {
          status: 'failed',
          error_message: error.message,
          updated_at: new Date().toISOString()
        });
      });

      res.status(200).json({
        success: true,
        message: 'Try-on session created successfully',
        data: {
          sessionId,
          status: 'queued',
          userImageUrl,
          garmentId,
          estimatedTime: '30-60 seconds',
          createdAt: session.created_at
        }
      });
    } catch (dbError) {
      console.error('Failed to create session:', dbError);
      res.status(500).json({
        success: false,
        message: 'Failed to create try-on session',
        error: dbError.message
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

    // Get session from database
    const session = await getTryOnSessionById(sessionId, userId || 'anonymous');

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        sessionId: session.id,
        status: session.status,
        progress: session.progress || 0,
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

// Get user's try-on history
app.get('/api/try-on/history', async (req, res) => {
  try {
    const { userId = 'anonymous', limit = 10, offset = 0, status } = req.query;

    const options = {
      status,
      limit: parseInt(limit),
      offset: parseInt(offset)
    };

    const history = await getUserTryOnHistory(userId, options);

    res.status(200).json({
      success: true,
      data: history,
      total: history.length,
      pagination: {
        limit: options.limit,
        offset: options.offset,
        hasMore: history.length === options.limit
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to get try-on history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve try-on history',
      error: error.message
    });
  }
});

// Delete session
app.delete('/api/try-on/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId = 'anonymous' } = req.query;

    await deleteTryOnSession(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      sessionId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to delete session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete session',
      error: error.message
    });
  }
});

// Webhook for Pixazo API
app.post('/api/webhooks/pixazo', async (req, res) => {
  try {
    const { job_id, status, result_image_url, error_message, session_id } = req.body;

    console.log('Received Pixazo webhook:', { job_id, status, session_id });

    if (!job_id || !status) {
      return res.status(400).json({
        success: false,
        message: 'Invalid webhook payload'
      });
    }

    // Update session status in database
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

    // Find session by job_id (you might need to add this field to your database)
    // For now, we'll assume session_id is provided in the webhook
    if (session_id) {
      await updateTryOnSession(session_id, updateData);
    }

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      processed_at: new Date().toISOString()
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

// Background function to process Pixazo request
async function processPixazoRequest(sessionId, userImageUrl, garmentId) {
  try {
    console.log(`Processing Pixazo request for session ${sessionId}`);

    // Update session status to processing
    await updateTryOnSession(sessionId, {
      status: 'processing',
      updated_at: new Date().toISOString()
    });

    // Perform virtual try-on
    const resultBuffer = await performVirtualTryOn(userImageUrl, null, {
      sessionId,
      maxWaitTime: 120000, // 2 minutes
      pollingInterval: 5000 // 5 seconds
    });

    if (resultBuffer) {
      // Upload result to Supabase Storage
      const resultImagePath = `try-on-sessions/${sessionId}/result-${Date.now()}.jpg`;
      const resultImageUrl = await uploadImage(resultImagePath, resultBuffer, 'image/jpeg');

      // Update session with result
      await updateTryOnSession(sessionId, {
        status: 'completed',
        result_image_url: resultImageUrl,
        completed_at: new Date().toISOString()
      });

      console.log(`Pixazo processing completed for session ${sessionId}`);
    }
  } catch (error) {
    console.error(`Pixazo processing failed for session ${sessionId}:`, error);

    // Update session with error
    await updateTryOnSession(sessionId, {
      status: 'failed',
      error_message: error.message,
      updated_at: new Date().toISOString()
    });
  }
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
    code: 'NOT_FOUND',
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/garments',
      'POST /api/try-on',
      'GET /api/try-on/:sessionId/status',
      'GET /api/try-on/history',
      'DELETE /api/try-on/:sessionId',
      'POST /api/webhooks/pixazo'
    ]
  });
});

// Export the Express app
module.exports = app;