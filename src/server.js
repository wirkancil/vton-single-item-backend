require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { logger } = require('./services/supabaseService');
const { shutdown } = require('./services/queueService');

// Import routes
const tryOnRoutes = require('./routes/tryOn');
const webhookRoutes = require('./routes/webhook');

// Create Express app
const app = express();

// Get port from environment
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Security middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
    },
  },
}));

// CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // In development, allow all origins
    if (NODE_ENV === 'development') {
      return callback(null, true);
    }

    // In production, you should specify allowed origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://your-lovable-app-domain.com',
      // Add your Lovable app domains here
    ];

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      logger.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Log request
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentLength: req.get('Content-Length')
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${res.statusCode}`, {
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length')
    });
  });

  next();
});

// Health check endpoint (before other routes)
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

// API routes
app.use('/api', tryOnRoutes);
app.use('/api', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.status(200).json({
    name: 'VTON Backend API',
    version: '1.0.0',
    description: 'Optimized Backend API for Single Item Virtual Try-On',
    environment: NODE_ENV,
    endpoints: {
      'POST /api/try-on': 'Create try-on session (requires auth)',
      'GET /api/try-on/:sessionId/status': 'Get session status (requires auth)',
      'GET /api/try-on/history': 'Get user history (requires auth)',
      'DELETE /api/try-on/:sessionId': 'Delete session (requires auth)',
      'GET /api/garments': 'Get available garments (public)',
      'GET /api/health': 'Health check (public)'
    },
    documentation: 'https://your-api-docs-url.com'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    code: 'NOT_FOUND',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error, req, res, next) => {
  logger.error('Unhandled error:', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  // Don't expose internal errors in production
  const message = NODE_ENV === 'production'
    ? 'Internal server error'
    : error.message;

  const statusCode = error.statusCode || error.status || 500;

  res.status(statusCode).json({
    success: false,
    message,
    code: 'INTERNAL_ERROR',
    ...(NODE_ENV === 'development' && {
      stack: error.stack,
      details: error
    })
  });
});

// Start server
const server = app.listen(PORT, () => {
  logger.info(`VTON Backend API started on port ${PORT}`);
  logger.info(`Environment: ${NODE_ENV}`);
  logger.info(`Health check: http://localhost:${PORT}/api/health`);
});

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, starting graceful shutdown...`);

  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      // Shutdown queues and cleanup
      await shutdown();
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

// Handle process termination
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

module.exports = app;