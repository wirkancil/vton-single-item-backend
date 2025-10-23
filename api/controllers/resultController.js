const Joi = require('joi');
const {
  createResultAnalytics,
  getUserResultGallery,
  getResultByShareToken,
  updateResultAnalytics,
  toggleFavorite,
  createShare,
  getUserResultAnalytics,
  deleteResultAnalytics
} = require('../services/resultService');
const { logger } = require('../services/supabaseService');

// Validation schemas
const analyticsSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  metadata: Joi.object({
    qualityScore: Joi.number().min(0).max(1).optional(),
    tags: Joi.array().items(Joi.string()).optional()
  }).optional()
});

const updateAnalyticsSchema = Joi.object({
  userRating: Joi.number().integer().min(1).max(5).optional(),
  feedbackText: Joi.string().max(1000).optional(),
  tags: Joi.array().items(Joi.string()).optional()
});

const galleryQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional(),
  isFavorite: Joi.boolean().optional(),
  isShared: Joi.boolean().optional(),
  tags: Joi.alternatives().try(
    Joi.array().items(Joi.string()),
    Joi.string()
  ).optional()
});

const shareSchema = Joi.object({
  expiresIn: Joi.number().integer().min(1).max(365).optional(),
  platform: Joi.string().optional()
});

const analyticsQuerySchema = Joi.object({
  startDate: Joi.date().optional(),
  endDate: Joi.date().optional()
});

/**
 * Create result analytics
 * POST /api/results/analytics
 */
exports.createResultAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const { error, value } = analyticsSchema.validate(req.body);
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

    logger.info(`Creating result analytics for session: ${value.sessionId}`);

    const analytics = await createResultAnalytics({
      userId,
      sessionId: value.sessionId,
      metadata: value.metadata || {}
    });

    res.status(201).json({
      success: true,
      message: 'Result analytics created successfully',
      data: {
        id: analytics.id,
        sessionId: analytics.session_id,
        shareToken: analytics.share_token,
        qualityScore: analytics.quality_score,
        tags: analytics.tags,
        createdAt: analytics.created_at
      }
    });

  } catch (error) {
    logger.error('Create result analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create result analytics',
      error: error.message
    });
  }
};

/**
 * Get user result gallery
 * GET /api/results/gallery
 */
exports.getUserResultGallery = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = galleryQuerySchema.validate(req.query);
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

    // Handle tags parameter
    if (value.tags && typeof value.tags === 'string') {
      value.tags = [value.tags];
    }

    logger.info(`Fetching result gallery for user: ${userId}`);

    const gallery = await getUserResultGallery(userId, value);

    res.status(200).json({
      success: true,
      data: {
        results: gallery,
        pagination: {
          limit: value.limit,
          offset: value.offset,
          count: gallery.length
        }
      }
    });

  } catch (error) {
    logger.error('Get user result gallery error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch result gallery',
      error: error.message
    });
  }
};

/**
 * Get result by share token (public)
 * GET /api/results/shared/:shareToken
 */
exports.getResultByShareToken = async (req, res) => {
  try {
    const { shareToken } = req.params;

    logger.info(`Fetching shared result: ${shareToken}`);

    const result = await getResultByShareToken(shareToken);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Shared result not found or expired',
        code: 'SHARE_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Get result by share token error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shared result',
      error: error.message
    });
  }
};

/**
 * Get specific result details
 * GET /api/results/:sessionId
 */
exports.getResultDetails = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    logger.info(`Fetching result details for session: ${sessionId}`);

    const gallery = await getUserResultGallery(userId, { limit: 1000 });
    const result = gallery.find(r => r.sessionId === sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found',
        code: 'RESULT_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Get result details error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch result details',
      error: error.message
    });
  }
};

/**
 * Update result analytics
 * PUT /api/results/:sessionId
 */
exports.updateResultAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = updateAnalyticsSchema.validate(req.body);
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

    logger.info(`Updating result analytics for session: ${sessionId}`);

    // First get the analytics record for this session
    const gallery = await getUserResultGallery(userId, { limit: 1000 });
    const result = gallery.find(r => r.sessionId === sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found',
        code: 'RESULT_NOT_FOUND'
      });
    }

    // Update the analytics record
    const updatedAnalytics = await updateResultAnalytics(result.id, userId, value);

    res.status(200).json({
      success: true,
      message: 'Result analytics updated successfully',
      data: {
        id: updatedAnalytics.id,
        sessionId: updatedAnalytics.session_id,
        userRating: updatedAnalytics.user_rating,
        feedbackText: updatedAnalytics.feedback_text,
        tags: updatedAnalytics.tags,
        updatedAt: updatedAnalytics.updated_at
      }
    });

  } catch (error) {
    logger.error('Update result analytics error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'ANALYTICS_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update result analytics',
      error: error.message
    });
  }
};

/**
 * Toggle favorite status
 * PUT /api/results/:sessionId/favorite
 */
exports.toggleFavorite = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    logger.info(`Toggling favorite status for session: ${sessionId}`);

    // First get the analytics record for this session
    const gallery = await getUserResultGallery(userId, { limit: 1000 });
    const result = gallery.find(r => r.sessionId === sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found',
        code: 'RESULT_NOT_FOUND'
      });
    }

    // Toggle favorite status
    const updatedAnalytics = await toggleFavorite(result.id, userId);

    res.status(200).json({
      success: true,
      message: `Result ${updatedAnalytics.is_favorite ? 'added to' : 'removed from'} favorites`,
      data: {
        sessionId: updatedAnalytics.session_id,
        isFavorite: updatedAnalytics.is_favorite,
        updatedAt: updatedAnalytics.updated_at
      }
    });

  } catch (error) {
    logger.error('Toggle favorite error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'RESULT_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to toggle favorite status',
      error: error.message
    });
  }
};

/**
 * Create share for result
 * POST /api/results/:sessionId/share
 */
exports.createShare = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = shareSchema.validate(req.body);
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

    logger.info(`Creating share for session: ${sessionId}`);

    // First get the analytics record for this session
    const gallery = await getUserResultGallery(userId, { limit: 1000 });
    const result = gallery.find(r => r.sessionId === sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found',
        code: 'RESULT_NOT_FOUND'
      });
    }

    // Create share
    const share = await createShare(result.id, userId, value);

    // Get updated result with share information
    const updatedGallery = await getUserResultGallery(userId, { limit: 1000 });
    const updatedResult = updatedGallery.find(r => r.sessionId === sessionId);

    res.status(201).json({
      success: true,
      message: 'Share created successfully',
      data: {
        shareToken: share.share_token,
        shareUrl: `${process.env.FRONTEND_URL || 'https://vton.ai'}/shared/${share.share_token}`,
        expiresAt: share.expires_at,
        platform: share.platform,
        result: updatedResult
      }
    });

  } catch (error) {
    logger.error('Create share error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'RESULT_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create share',
      error: error.message
    });
  }
};

/**
 * Get user result analytics
 * GET /api/results/analytics
 */
exports.getUserResultAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = analyticsQuerySchema.validate(req.query);
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

    logger.info(`Fetching result analytics for user: ${userId}`);

    const analytics = await getUserResultAnalytics(userId, value);

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    logger.error('Get user result analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch result analytics',
      error: error.message
    });
  }
};

/**
 * Delete result analytics
 * DELETE /api/results/:sessionId
 */
exports.deleteResultAnalytics = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user.id;

    logger.info(`Deleting result analytics for session: ${sessionId}`);

    // First get the analytics record for this session
    const gallery = await getUserResultGallery(userId, { limit: 1000 });
    const result = gallery.find(r => r.sessionId === sessionId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Result not found',
        code: 'RESULT_NOT_FOUND'
      });
    }

    // Delete analytics record
    await deleteResultAnalytics(result.id, userId);

    res.status(200).json({
      success: true,
      message: 'Result deleted successfully'
    });

  } catch (error) {
    logger.error('Delete result analytics error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'RESULT_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete result',
      error: error.message
    });
  }
};