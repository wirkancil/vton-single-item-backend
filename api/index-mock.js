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

// Health check for root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'VTON Backend API is running',
    version: '1.0.0',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'production',
    vercel: true,
    endpoints: {
      tryOn: '/api/try-on',
      garments: '/api/garments',
      health: '/api/health',
      webhook: '/api/webhooks/pixazo'
    }
  });
});

// Health check endpoint with basic status
app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = {
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      environment: process.env.NODE_ENV || 'production',
      services: {
        supabase: {
          status: process.env.SUPABASE_URL ? 'configured' : 'not_configured',
          message: process.env.SUPABASE_URL ? 'Supabase URL available' : 'Supabase URL not configured'
        },
        pixazo: {
          status: process.env.PIXAZO_API_KEY ? 'configured' : 'not_configured',
          message: process.env.PIXAZO_API_KEY ? 'API key available' : 'API key not configured'
        }
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

// Get all available garments (mock data for now)
app.get('/api/garments', async (req, res) => {
  try {
    const { category, brand, limit = 50, offset = 0 } = req.query;

    // Mock garments data
    const mockGarments = [
      {
        id: 'garment_001',
        name: 'Classic White T-Shirt',
        category: 'top',
        brand: 'Generic',
        image_url: 'https://example.com/tshirt.jpg',
        created_at: new Date().toISOString()
      },
      {
        id: 'garment_002',
        name: 'Blue Jeans',
        category: 'bottom',
        brand: 'Generic',
        image_url: 'https://example.com/jeans.jpg',
        created_at: new Date().toISOString()
      }
    ];

    const garments = mockGarments.slice(
      parseInt(offset),
      parseInt(offset) + parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: garments,
      total: garments.length,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        hasMore: garments.length === parseInt(limit)
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

// Create new try-on session (mock implementation)
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

    // Mock session creation
    const sessionData = {
      id: sessionId,
      user_id: userId || 'anonymous',
      garment_id: garmentId,
      status: 'completed',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result_image_url: 'https://example.com/result.jpg',
      completed_at: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      message: 'Try-on session created successfully',
      data: {
        sessionId,
        status: 'completed',
        resultImageUrl: sessionData.result_image_url,
        garmentId,
        createdAt: sessionData.created_at,
        completedAt: sessionData.completed_at
      }
    });
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

    // Mock session data
    const sessionData = {
      id: sessionId,
      status: 'completed',
      progress: 100,
      result_image_url: 'https://example.com/result.jpg',
      garment_id: 'garment_001',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString()
    };

    res.status(200).json({
      success: true,
      data: {
        sessionId: sessionData.id,
        status: sessionData.status,
        progress: sessionData.progress,
        resultImageUrl: sessionData.result_image_url,
        garmentId: sessionData.garment_id,
        createdAt: sessionData.created_at,
        completedAt: sessionData.completed_at
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
      'GET /api/try-on/:sessionId/status'
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