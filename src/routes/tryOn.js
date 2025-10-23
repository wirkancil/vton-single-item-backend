const express = require('express');
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

const router = express.Router();

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
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit uploads to 20 per windowMs
  message: {
    success: false,
    message: 'Too many upload requests, please try again later.',
    code: 'UPLOAD_RATE_LIMIT_EXCEEDED'
  }
});

/**
 * @route   POST /api/try-on
 * @desc    Create a new try-on session
 * @access  Private
 */
router.post('/',
  authenticateToken,
  uploadRateLimit,
  upload.single('userImage'),
  createTryOnSession
);

/**
 * @route   GET /api/try-on/:sessionId/status
 * @desc    Get try-on session status
 * @access  Private
 */
router.get('/:sessionId/status',
  authenticateToken,
  validateSessionId,
  getSessionStatus
);

/**
 * @route   GET /api/try-on/history
 * @desc    Get user's try-on history
 * @access  Private
 */
router.get('/history',
  authenticateToken,
  tryOnRateLimit,
  getTryOnHistory
);

/**
 * @route   DELETE /api/try-on/:sessionId
 * @desc    Delete try-on session
 * @access  Private
 */
router.delete('/:sessionId',
  authenticateToken,
  validateSessionId,
  deleteTryOnSession
);

/**
 * @route   GET /api/garments
 * @desc    Get all available garments
 * @access  Public
 */
router.get('/garments',
  optionalAuth, // Optional auth for potential personalization in future
  tryOnRateLimit,
  getAllGarments
);

/**
 * @route   GET /api/health
 * @desc    Health check endpoint
 * @access  Public
 */
router.get('/health',
  healthCheck
);

// Error handling middleware for multer errors
router.use((error, req, res, next) => {
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

  // Handle file filter errors
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: 'INVALID_FILE_TYPE'
    });
  }

  next(error);
});

module.exports = router;