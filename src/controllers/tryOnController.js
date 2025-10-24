const { v4: uuidv4 } = require('uuid');
const Joi = require('joi');
const {
  supabase,
  getGarmentById,
  createTryOnSession,
  updateTryOnSession,
  getTryOnSessionById,
  getUserTryOnHistory,
  deleteTryOnSession,
  logger
} = require('../services/supabaseService');
const { addTryOnJob } = require('../services/queueService');
const { uploadImageToSupabase } = require('../services/enhancedStorageService');

// Validation schemas
const createTryOnSchema = Joi.object({
  garmentId: Joi.string().uuid().required().messages({
    'string.uuid': 'Garment ID must be a valid UUID',
    'any.required': 'Garment ID is required'
  })
});

const historyQuerySchema = Joi.object({
  status: Joi.string().valid('queued', 'processing', 'success', 'failed').optional(),
  limit: Joi.number().integer().min(1).max(100).default(10).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

const garmentsQuerySchema = Joi.object({
  category: Joi.string().optional(),
  brand: Joi.string().optional(),
  limit: Joi.number().integer().min(1).max(100).default(50).optional(),
  offset: Joi.number().integer().min(0).default(0).optional()
});

/**
 * Create a new try-on session
 * POST /api/try-on
 */
exports.createTryOnSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const userImageFile = req.file;

    // Validate request body
    const { error, value } = createTryOnSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { garmentId } = value;

    // Check if file was uploaded
    if (!userImageFile) {
      return res.status(400).json({
        success: false,
        message: 'User image is required',
        code: 'MISSING_USER_IMAGE'
      });
    }

    // Validate file type and size
    const allowedMimeTypes = process.env.ALLOWED_MIME_TYPES?.split(',') || ['image/jpeg', 'image/jpg', 'image/png'];
    const maxFileSize = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024; // 10MB

    if (!allowedMimeTypes.includes(userImageFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Invalid file type. Allowed types: ${allowedMimeTypes.join(', ')}`,
        code: 'INVALID_FILE_TYPE'
      });
    }

    if (userImageFile.size > maxFileSize) {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size: ${maxFileSize / (1024 * 1024)}MB`,
        code: 'FILE_TOO_LARGE'
      });
    }

    logger.info(`Creating try-on session for user ${userId}, garment ${garmentId}`);

    // Check if garment exists
    let garment;
    try {
      garment = await getGarmentById(garmentId);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Garment not found',
        code: 'GARMENT_NOT_FOUND'
      });
    }

    // Generate unique session ID
    const sessionId = uuidv4();

    // Upload user image using enhanced storage service
    let uploadResult;

    try {
      const fileName = `${sessionId}_user-image.${userImageFile.mimetype.split('/')[1] || 'jpg'}`;
      uploadResult = await uploadImageToSupabase(
        userImageFile.buffer,
        fileName,
        userImageFile.mimetype,
        'vton-sessions'
      );
    } catch (error) {
      logger.error('Failed to upload user image:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to upload user image',
        code: 'UPLOAD_FAILED',
        details: error.message
      });
    }

    // Create try-on session record
    let sessionData;
    try {
      sessionData = await createTryOnSession({
        id: sessionId,
        user_id: userId,
        garment_id: garmentId,
        original_user_image_url: uploadResult.url,
        status: 'queued'
      });
    } catch (error) {
      logger.error('Failed to create try-on session:', error);

      // Clean up uploaded image if session creation failed
      try {
        const { deleteImage } = require('../services/enhancedStorageService');
        await deleteImage(uploadResult.path);
      } catch (cleanupError) {
        logger.error('Failed to clean up uploaded image:', cleanupError);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create try-on session',
        code: 'SESSION_CREATION_FAILED'
      });
    }

    // Add job to queue for background processing
    try {
      await addTryOnJob({
        sessionId,
        userId,
        garmentId,
        originalUserImageUrl,
        garmentImageUrl: garment.image_url
      });
    } catch (error) {
      logger.error('Failed to add job to queue:', error);

      // Update session status to failed
      try {
        await updateTryOnSession(sessionId, {
          status: 'failed',
          error_message: 'Failed to queue processing job'
        });
      } catch (updateError) {
        logger.error('Failed to update session status:', updateError);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to queue processing job',
        code: 'QUEUE_FAILED'
      });
    }

    logger.info(`Try-on session created successfully: ${sessionId}`);

    // Return immediate response with session ID
    res.status(202).json({
      success: true,
      message: 'Try-on session created successfully. Processing started.',
      data: {
        sessionId: sessionData.id,
        status: sessionData.status,
        createdAt: sessionData.created_at,
        estimatedProcessingTime: 45 // seconds
      }
    });

  } catch (error) {
    logger.error('Unexpected error in createTryOnSession:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
};

/**
 * Get try-on session status
 * GET /api/try-on/:sessionId/status
 */
exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Get session details
    let sessionData;
    try {
      sessionData = await getTryOnSessionById(sessionId, userId);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Return relevant status information
    const responseData = {
      sessionId: sessionData.id,
      status: sessionData.status,
      createdAt: sessionData.created_at,
      updatedAt: sessionData.updated_at
    };

    // Add result URL if processing is complete
    if (sessionData.status === 'success' && sessionData.result_image_url) {
      responseData.resultImageUrl = sessionData.result_image_url;
    }

    // Add error message if processing failed
    if (sessionData.status === 'failed' && sessionData.error_message) {
      responseData.errorMessage = sessionData.error_message;
    }

    res.status(200).json({
      success: true,
      data: responseData
    });

  } catch (error) {
    logger.error('Unexpected error in getSessionStatus:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Get user's try-on history
 * GET /api/try-on/history
 */
exports.getTryOnHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = historyQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { status, limit, offset } = value;

    // Get user's try-on history
    let historyData;
    try {
      historyData = await getUserTryOnHistory(userId, { status, limit, offset });
    } catch (error) {
      logger.error('Failed to get try-on history:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve try-on history',
        code: 'HISTORY_RETRIEVAL_FAILED'
      });
    }

    // Transform data for response
    const transformedHistory = historyData.map(session => ({
      sessionId: session.id,
      status: session.status,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      garment: session.garments ? {
        id: session.garments.id,
        name: session.garments.name,
        brand: session.garments.brand,
        category: session.garments.category,
        imageUrl: session.garments.image_url
      } : null,
      originalImageUrl: session.original_user_image_url,
      resultImageUrl: session.result_image_url,
      errorMessage: session.error_message
    }));

    res.status(200).json({
      success: true,
      data: {
        sessions: transformedHistory,
        pagination: {
          limit,
          offset,
          count: transformedHistory.length
        }
      }
    });

  } catch (error) {
    logger.error('Unexpected error in getTryOnHistory:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Delete try-on session
 * DELETE /api/try-on/:sessionId
 */
exports.deleteTryOnSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    logger.info(`Deleting try-on session: ${sessionId} by user: ${userId}`);

    // Check if session exists and user has permission
    let sessionData;
    try {
      sessionData = await getTryOnSessionById(sessionId, userId);
    } catch (error) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
        code: 'SESSION_NOT_FOUND'
      });
    }

    // Don't allow deletion of sessions that are currently processing
    if (sessionData.status === 'processing') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete session that is currently being processed',
        code: 'SESSION_PROCESSING'
      });
    }

    // Delete session and associated files
    try {
      await deleteTryOnSession(sessionId, userId);
    } catch (error) {
      logger.error('Failed to delete try-on session:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete try-on session',
        code: 'DELETION_FAILED'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Try-on session deleted successfully'
    });

  } catch (error) {
    logger.error('Unexpected error in deleteTryOnSession:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Get all available garments
 * GET /api/garments
 */
exports.getAllGarments = async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = garmentsQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Invalid query parameters',
        errors: error.details.map(detail => ({
          field: detail.path.join('.'),
          message: detail.message
        }))
      });
    }

    const { category, brand, limit, offset } = value;

    // Get garments from database
    let garmentsData;
    try {
      garmentsData = await getAllGarments({ category, brand, limit, offset });
    } catch (error) {
      logger.error('Failed to get garments:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve garments',
        code: 'GARMENTS_RETRIEVAL_FAILED'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        garments: garmentsData,
        pagination: {
          limit,
          offset,
          count: garmentsData.length
        }
      }
    });

  } catch (error) {
    logger.error('Unexpected error in getAllGarments:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_ERROR'
    });
  }
};

/**
 * Health check endpoint
 * GET /api/health
 */
exports.healthCheck = async (req, res) => {
  try {
    // Check database connection
    let dbHealthy = false;
    try {
      const { data, error } = await supabase
        .from('garments')
        .select('id')
        .limit(1);

      dbHealthy = !error;
    } catch (error) {
      logger.error('Database health check failed:', error);
    }

    // Check queue connection (simplified check)
    let queueHealthy = true; // Assume healthy for now

    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      services: {
        database: {
          status: dbHealthy ? 'healthy' : 'unhealthy',
          connected: dbHealthy
        },
        queue: {
          status: queueHealthy ? 'healthy' : 'unhealthy',
          connected: queueHealthy
        }
      }
    };

    const overallHealthy = dbHealthy && queueHealthy;

    res.status(overallHealthy ? 200 : 503).json(healthStatus);

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
};