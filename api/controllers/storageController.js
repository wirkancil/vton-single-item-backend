const Joi = require('joi');
const {
  getUserStorageUsage,
  cleanupOldFiles,
  optimizeStorage,
  getGlobalStorageStats,
  getBucketInfo
} = require('../services/storageService');
const { logger } = require('../services/supabaseService');

// Validation schemas
const cleanupSchema = Joi.object({
  olderThanDays: Joi.number().integer().min(1).max(365).default(30).optional(),
  fileTypes: Joi.array().items(Joi.string().valid('user_upload', 'result', 'model', 'garment')).optional(),
  keepFavorites: Joi.boolean().default(true).optional()
});

/**
 * Get user storage usage
 * GET /api/storage/usage
 */
exports.getUserStorageUsage = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`Fetching storage usage for user: ${userId}`);

    const usage = await getUserStorageUsage(userId);

    res.status(200).json({
      success: true,
      data: usage
    });

  } catch (error) {
    logger.error('Get user storage usage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch storage usage',
      error: error.message
    });
  }
};

/**
 * Cleanup old files
 * POST /api/storage/cleanup
 */
exports.cleanupOldFiles = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const { error, value } = cleanupSchema.validate(req.body);
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

    logger.info(`Cleaning up old files for user: ${userId}`);

    const results = await cleanupOldFiles(userId, value);

    res.status(200).json({
      success: true,
      message: 'File cleanup completed',
      data: results
    });

  } catch (error) {
    logger.error('Cleanup old files error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup old files',
      error: error.message
    });
  }
};

/**
 * Optimize storage
 * POST /api/storage/optimize
 */
exports.optimizeStorage = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`Optimizing storage for user: ${userId}`);

    const results = await optimizeStorage(userId);

    res.status(200).json({
      success: true,
      message: 'Storage optimization completed',
      data: results
    });

  } catch (error) {
    logger.error('Optimize storage error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize storage',
      error: error.message
    });
  }
};

/**
 * Get global storage statistics (admin only)
 * GET /api/storage/global-stats
 */
exports.getGlobalStorageStats = async (req, res) => {
  try {
    // Check if user is admin (you might want to implement proper admin check)
    if (!req.user || !req.user.email.endsWith('@admin.com')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    logger.info('Fetching global storage statistics (admin)');

    const stats = await getGlobalStorageStats();

    res.status(200).json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Get global storage stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch global storage statistics',
      error: error.message
    });
  }
};

/**
 * Get bucket information (admin only)
 * GET /api/storage/buckets
 */
exports.getBucketInfo = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || !req.user.email.endsWith('@admin.com')) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required',
        code: 'ADMIN_REQUIRED'
      });
    }

    logger.info('Fetching bucket information (admin)');

    const buckets = await getBucketInfo();

    res.status(200).json({
      success: true,
      data: {
        buckets
      }
    });

  } catch (error) {
    logger.error('Get bucket info error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch bucket information',
      error: error.message
    });
  }
};