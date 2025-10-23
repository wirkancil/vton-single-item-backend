const express = require('express');
const cors = require('cors');
const tryOnRoutes = require('./try-on');
const webhookRoutes = require('./webhooks');

// Create Express app for serverless function
const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://lovable.ai', 'https://vton.ai-agentic.tech'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    service: 'VTON Backend API'
  });
});

// Route handlers
app.use('/api/try-on', tryOnRoutes);
app.use('/api/webhooks', webhookRoutes);

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