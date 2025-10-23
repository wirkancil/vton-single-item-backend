const express = require('express');
const cors = require('cors');

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
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Simple health check for root endpoint
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
      health: '/api/health',
      tryOn: '/api/try-on',
      garments: '/api/garments'
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    service: 'VTON Backend API',
    platform: 'Vercel Serverless Functions'
  });
});

// Simple garments endpoint (mock data)
app.get('/api/garments', (req, res) => {
  res.status(200).json({
    success: true,
    data: [
      {
        id: 'garment_001',
        name: 'Classic White T-Shirt',
        category: 'tops',
        description: 'Comfortable cotton t-shirt',
        imageUrl: 'https://example.com/tshirt.jpg',
        available: true
      },
      {
        id: 'garment_002',
        name: 'Blue Jeans',
        category: 'bottoms',
        description: 'Classic denim jeans',
        imageUrl: 'https://example.com/jeans.jpg',
        available: true
      }
    ],
    total: 2,
    timestamp: new Date().toISOString()
  });
});

// Simple try-on endpoint (mock response)
app.post('/api/try-on', (req, res) => {
  try {
    const { userImage, garmentId } = req.body;

    if (!userImage || !garmentId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: userImage and garmentId',
        code: 'MISSING_FIELDS'
      });
    }

    // Mock session creation
    const sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    res.status(200).json({
      success: true,
      message: 'Try-on session created successfully',
      data: {
        sessionId,
        status: 'queued',
        estimatedTime: '30-60 seconds',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Try-on error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
});

// Session status endpoint (mock)
app.get('/api/try-on/:sessionId/status', (req, res) => {
  try {
    const { sessionId } = req.params;

    // Mock status response
    res.status(200).json({
      success: true,
      data: {
        sessionId,
        status: 'completed',
        progress: 100,
        resultImageUrl: 'https://example.com/result.jpg',
        createdAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
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
    ...(process.env.NODE_ENV === 'development' && {
      stack: error.stack,
      details: error
    })
  });
});

// Export the Express app for Vercel
module.exports = app;