const express = require('express');
const cors = require('cors');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
  authenticateToken,
  validateSessionId,
  optionalAuth
} = require('../middleware/authMiddleware');
const {
  createTryOnSession,
  getSessionStatus,
  getTryOnHistory,
  deleteTryOnSession,
  getAllGarments,
  healthCheck
} = require('../controllers/tryOnController');

// Create Express app for serverless function
const app = express();

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://lovable.ai', 'https://vton.ai-agentic.tech'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
    files: 1
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

// Rate limiting configuration
const tryOnRateLimit = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: 'Too many upload requests, please try again later.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  }
});

// Routes
app.post('/', authenticateToken, uploadRateLimit, upload.single('userImage'), createTryOnSession);
app.get('/:sessionId/status', authenticateToken, validateSessionId, getSessionStatus);
app.get('/history', authenticateToken, tryOnRateLimit, getTryOnHistory);
app.delete('/:sessionId', authenticateToken, validateSessionId, deleteTryOnSession);
app.get('/garments', optionalAuth, tryOnRateLimit, getAllGarments);
app.get('/health', healthCheck);

// Error handling middleware
app.use((error, req, res, next) => {
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
      code
    });
  }

  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  console.error('API Error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_ERROR'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Export the Express app
module.exports = app;