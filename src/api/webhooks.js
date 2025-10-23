const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { updateTryOnSession, getTryOnSessionByJobId } = require('../services/supabaseService');
const { logger } = require('../services/supabaseService');

// Create Express app for serverless function
const app = express();

// CORS configuration
app.use(cors({
  origin: true, // Allow all origins for webhooks
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Pixazo-Signature']
}));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Verify webhook signature (if provided)
function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-pixazo-signature'];
  const secret = process.env.PIXAZO_WEBHOOK_SECRET;

  // If no secret is configured, skip verification (not recommended for production)
  if (!secret) {
    logger.warn('Webhook secret not configured. Skipping signature verification.');
    return next();
  }

  if (!signature) {
    return res.status(401).json({
      success: false,
      message: 'Webhook signature missing',
      code: 'SIGNATURE_MISSING'
    });
  }

  try {
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      return res.status(401).json({
        success: false,
        message: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    next();
  } catch (error) {
    logger.error('Webhook signature verification failed:', error);
    return res.status(401).json({
      success: false,
      message: 'Signature verification failed',
      code: 'VERIFICATION_ERROR'
    });
  }
}

// Pixazo webhook endpoint
app.post('/pixazo', verifyWebhookSignature, async (req, res) => {
  try {
    const sessionId = req.query.session_id;
    const webhookData = req.body;

    logger.info('Received Pixazo webhook:', {
      sessionId,
      jobId: webhookData.id,
      status: webhookData.status,
      timestamp: new Date().toISOString()
    });

    // Basic validation
    if (!webhookData.id) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required',
        code: 'MISSING_JOB_ID'
      });
    }

    // Find session by job ID (if session_id not provided in query)
    let sessionData = null;
    if (sessionId) {
      try {
        // In a real implementation, you would have a way to get session by ID
        // For now, we'll log the session ID
        logger.info(`Webhook for session: ${sessionId}`);
        sessionData = { id: sessionId }; // Placeholder
      } catch (error) {
        logger.error('Failed to find session by ID:', error);
      }
    }

    // Process different webhook statuses
    let status = 'queued';
    let errorMessage = null;
    let resultImageUrl = null;

    switch (webhookData.status) {
      case 'completed':
      case 'success':
        status = 'success';
        if (webhookData.result_image_url) {
          resultImageUrl = webhookData.result_image_url;
        } else if (webhookData.result_image_base64) {
          // If base64 image is provided, we'd need to upload it to storage
          // For now, we'll use the base64 data directly
          resultImageUrl = `data:image/png;base64,${webhookData.result_image_base64}`;
        }
        break;

      case 'failed':
      case 'error':
        status = 'failed';
        errorMessage = webhookData.error || webhookData.message || 'Processing failed';
        break;

      case 'processing':
      case 'pending':
        status = 'processing';
        break;

      default:
        logger.warn('Unknown webhook status:', webhookData.status);
        status = 'processing'; // Default to processing
    }

    // Update session in database (if we have session data)
    if (sessionData && sessionData.id) {
      try {
        await updateTryOnSession(sessionData.id, {
          status,
          result_image_url: resultImageUrl,
          error_message: errorMessage,
          updated_at: new Date().toISOString()
        });

        logger.info(`Session ${sessionData.id} updated to status: ${status}`);
      } catch (error) {
        logger.error('Failed to update session:', error);
        // Don't fail the webhook response if database update fails
      }
    }

    // Return success response
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: {
        sessionId,
        jobId: webhookData.id,
        status,
        resultImageUrl,
        errorMessage
      }
    });

  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      code: 'WEBHOOK_ERROR'
    });
  }
});

// Health check for webhook endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'webhook-receiver'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Webhook API Error:', error);
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
    message: 'Webhook endpoint not found',
    code: 'NOT_FOUND'
  });
});

// Export the Express app
module.exports = app;