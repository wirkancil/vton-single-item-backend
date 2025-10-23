const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const {
  handlePixazoCallback,
  validateWebhookSignature
} = require('../controllers/webhookController');

const router = express.Router();

// Rate limiting for webhook endpoints
const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: {
    success: false,
    message: 'Too many webhook requests',
    code: 'WEBHOOK_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware to parse raw body for signature validation
router.use('/pixazo', express.raw({ type: 'application/json' }), (req, res, next) => {
  try {
    // Store raw body and also parse JSON for controller
    if (req.body && typeof req.body === 'string') {
      req.rawBody = req.body;
      req.body = JSON.parse(req.body);
    } else if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString('utf8');
      req.body = JSON.parse(req.rawBody);
    } else {
      req.rawBody = JSON.stringify(req.body);
    }
    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: 'Invalid JSON payload',
      code: 'INVALID_PAYLOAD'
    });
  }
});

/**
 * @route   POST /api/webhooks/pixazo
 * @desc    Handle callbacks from Pixazo API
 * @access  Public (but protected by signature validation)
 */
router.post('/pixazo',
  webhookRateLimit,
  async (req, res) => {
    try {
      // Log incoming webhook
      console.log('Pixazo webhook received:', {
        headers: req.headers,
        body: req.body,
        timestamp: new Date().toISOString()
      });

      // Validate webhook signature (if signature is provided)
      const signature = req.headers['x-pixazo-signature'] || req.headers['x-signature'];
      if (signature && !validateWebhookSignature(req.rawBody, signature)) {
        return res.status(401).json({
          success: false,
          message: 'Invalid webhook signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Handle the callback
      await handlePixazoCallback(req.body);

      // Return success response immediately
      res.status(200).json({
        success: true,
        message: 'Webhook processed successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Webhook processing error:', error);

      // Still return 200 to prevent retry loops, but include error info
      res.status(200).json({
        success: false,
        message: 'Webhook processing failed',
        error: error.message,
        code: 'WEBHOOK_PROCESSING_ERROR',
        timestamp: new Date().toISOString()
      });
    }
  }
);

/**
 * @route   GET /api/webhooks/health
 * @desc    Health check for webhook endpoints
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'webhook-handler'
  });
});

module.exports = router;