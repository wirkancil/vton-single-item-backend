const Joi = require('joi');
const multer = require('multer');
const {
  createFaceModel,
  getUserFaceModels,
  updateFaceModel,
  deleteFaceModel,
  createSizeProfile,
  getUserSizeProfiles,
  updateSizeProfile,
  deleteSizeProfile,
  getUserModelAnalytics
} = require('../services/modelService');
const { logger } = require('../services/supabaseService');

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG and PNG are allowed.'));
    }
  }
});

// Validation schemas
const faceModelSchema = Joi.object({
  modelName: Joi.string().min(1).max(100).optional(),
  metadata: Joi.object({
    faceFeatures: Joi.object().optional(),
    accuracyScore: Joi.number().min(0).max(1).optional(),
    trainingImages: Joi.array().items(Joi.string()).optional()
  }).optional()
});

const sizeProfileSchema = Joi.object({
  profileName: Joi.string().min(1).max(100).optional(),
  bodyMeasurements: Joi.object().required(),
  sizePreferences: Joi.object().optional(),
  metadata: Joi.object({
    recommendedSizes: Joi.object().optional(),
    bodyShape: Joi.string().optional(),
    confidenceScore: Joi.number().min(0).max(1).optional()
  }).optional()
});

const updateModelSchema = Joi.object({
  modelName: Joi.string().min(1).max(100).optional(),
  isActive: Joi.boolean().optional(),
  metadata: Joi.object().optional()
});

const querySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(100).default(20).optional(),
  offset: Joi.number().integer().min(0).default(0).optional(),
  isActive: Joi.boolean().optional()
});

/**
 * Create face model
 * POST /api/models/faces
 */
exports.createFaceModel = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const { error, value } = faceModelSchema.validate(req.body);
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

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Face model image is required',
        code: 'MISSING_FACE_IMAGE'
      });
    }

    logger.info(`Creating face model for user: ${userId}`);

    // Create face model
    const faceModel = await createFaceModel({
      userId,
      modelImage: req.file.buffer,
      modelName: value.modelName,
      metadata: value.metadata || {}
    });

    res.status(201).json({
      success: true,
      message: 'Face model created successfully',
      data: {
        id: faceModel.id,
        modelName: faceModel.model_name,
        accuracyScore: faceModel.accuracy_score,
        isActive: faceModel.is_active,
        createdAt: faceModel.created_at,
        updatedAt: faceModel.updated_at
      }
    });

  } catch (error) {
    logger.error('Create face model error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create face model',
      error: error.message
    });
  }
};

/**
 * Get user face models
 * GET /api/models/faces
 */
exports.getUserFaceModels = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = querySchema.validate(req.query);
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

    logger.info(`Fetching face models for user: ${userId}`);

    const faceModels = await getUserFaceModels(userId, value);

    // Transform for response
    const transformedModels = faceModels.map(model => ({
      id: model.id,
      modelName: model.model_name,
      accuracyScore: model.accuracy_score,
      isActive: model.is_active,
      trainingImages: model.training_images,
      metadata: model.metadata,
      createdAt: model.created_at,
      updatedAt: model.updated_at
    }));

    res.status(200).json({
      success: true,
      data: {
        faceModels: transformedModels,
        pagination: {
          limit: value.limit,
          offset: value.offset,
          count: transformedModels.length
        }
      }
    });

  } catch (error) {
    logger.error('Get user face models error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch face models',
      error: error.message
    });
  }
};

/**
 * Update face model
 * PUT /api/models/faces/:modelId
 */
exports.updateFaceModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = updateModelSchema.validate(req.body);
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

    logger.info(`Updating face model: ${modelId} for user: ${userId}`);

    // Transform field names
    const updateData = {};
    if (value.modelName !== undefined) updateData.model_name = value.modelName;
    if (value.isActive !== undefined) updateData.is_active = value.isActive;
    if (value.metadata !== undefined) updateData.metadata = value.metadata;

    const updatedModel = await updateFaceModel(modelId, userId, updateData);

    res.status(200).json({
      success: true,
      message: 'Face model updated successfully',
      data: {
        id: updatedModel.id,
        modelName: updatedModel.model_name,
        accuracyScore: updatedModel.accuracy_score,
        isActive: updatedModel.is_active,
        metadata: updatedModel.metadata,
        updatedAt: updatedModel.updated_at
      }
    });

  } catch (error) {
    logger.error('Update face model error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'MODEL_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update face model',
      error: error.message
    });
  }
};

/**
 * Delete face model
 * DELETE /api/models/faces/:modelId
 */
exports.deleteFaceModel = async (req, res) => {
  try {
    const { modelId } = req.params;
    const userId = req.user.id;

    logger.info(`Deleting face model: ${modelId} for user: ${userId}`);

    await deleteFaceModel(modelId, userId);

    res.status(200).json({
      success: true,
      message: 'Face model deleted successfully'
    });

  } catch (error) {
    logger.error('Delete face model error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'MODEL_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete face model',
      error: error.message
    });
  }
};

/**
 * Create size profile
 * POST /api/models/size-profiles
 */
exports.createSizeProfile = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate request body
    const { error, value } = sizeProfileSchema.validate(req.body);
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

    logger.info(`Creating size profile for user: ${userId}`);

    const sizeProfile = await createSizeProfile({
      userId,
      profileName: value.profileName,
      bodyMeasurements: value.bodyMeasurements,
      sizePreferences: value.sizePreferences,
      metadata: value.metadata || {}
    });

    res.status(201).json({
      success: true,
      message: 'Size profile created successfully',
      data: {
        id: sizeProfile.id,
        profileName: sizeProfile.profile_name,
        bodyMeasurements: sizeProfile.body_measurements,
        sizePreferences: sizeProfile.size_preferences,
        recommendedSizes: sizeProfile.recommended_sizes,
        bodyShape: sizeProfile.body_shape,
        confidenceScore: sizeProfile.confidence_score,
        isActive: sizeProfile.is_active,
        createdAt: sizeProfile.created_at,
        updatedAt: sizeProfile.updated_at
      }
    });

  } catch (error) {
    logger.error('Create size profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create size profile',
      error: error.message
    });
  }
};

/**
 * Get user size profiles
 * GET /api/models/size-profiles
 */
exports.getUserSizeProfiles = async (req, res) => {
  try {
    const userId = req.user.id;

    // Validate query parameters
    const { error, value } = querySchema.validate(req.query);
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

    logger.info(`Fetching size profiles for user: ${userId}`);

    const sizeProfiles = await getUserSizeProfiles(userId, value);

    // Transform for response
    const transformedProfiles = sizeProfiles.map(profile => ({
      id: profile.id,
      profileName: profile.profile_name,
      bodyMeasurements: profile.body_measurements,
      sizePreferences: profile.size_preferences,
      recommendedSizes: profile.recommended_sizes,
      bodyShape: profile.body_shape,
      confidenceScore: profile.confidence_score,
      isActive: profile.is_active,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at
    }));

    res.status(200).json({
      success: true,
      data: {
        sizeProfiles: transformedProfiles,
        pagination: {
          limit: value.limit,
          offset: value.offset,
          count: transformedProfiles.length
        }
      }
    });

  } catch (error) {
    logger.error('Get user size profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch size profiles',
      error: error.message
    });
  }
};

/**
 * Update size profile
 * PUT /api/models/size-profiles/:profileId
 */
exports.updateSizeProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.id;

    // Validate request body
    const { error, value } = updateModelSchema.validate(req.body);
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

    logger.info(`Updating size profile: ${profileId} for user: ${userId}`);

    // Transform field names
    const updateData = {};
    if (value.modelName !== undefined) updateData.profile_name = value.modelName;
    if (value.isActive !== undefined) updateData.is_active = value.isActive;
    if (value.metadata !== undefined) {
      updateData.body_measurements = value.metadata.bodyMeasurements;
      updateData.size_preferences = value.metadata.sizePreferences;
      updateData.recommended_sizes = value.metadata.recommendedSizes;
      updateData.body_shape = value.metadata.bodyShape;
      updateData.confidence_score = value.metadata.confidenceScore;
    }

    const updatedProfile = await updateSizeProfile(profileId, userId, updateData);

    res.status(200).json({
      success: true,
      message: 'Size profile updated successfully',
      data: {
        id: updatedProfile.id,
        profileName: updatedProfile.profile_name,
        bodyMeasurements: updatedProfile.body_measurements,
        sizePreferences: updatedProfile.size_preferences,
        recommendedSizes: updatedProfile.recommended_sizes,
        bodyShape: updatedProfile.body_shape,
        confidenceScore: updatedProfile.confidence_score,
        isActive: updatedProfile.is_active,
        updatedAt: updatedProfile.updated_at
      }
    });

  } catch (error) {
    logger.error('Update size profile error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update size profile',
      error: error.message
    });
  }
};

/**
 * Delete size profile
 * DELETE /api/models/size-profiles/:profileId
 */
exports.deleteSizeProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.id;

    logger.info(`Deleting size profile: ${profileId} for user: ${userId}`);

    await deleteSizeProfile(profileId, userId);

    res.status(200).json({
      success: true,
      message: 'Size profile deleted successfully'
    });

  } catch (error) {
    logger.error('Delete size profile error:', error);

    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'PROFILE_NOT_FOUND'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to delete size profile',
      error: error.message
    });
  }
};

/**
 * Get user model analytics
 * GET /api/models/analytics
 */
exports.getUserModelAnalytics = async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info(`Fetching model analytics for user: ${userId}`);

    const analytics = await getUserModelAnalytics(userId);

    res.status(200).json({
      success: true,
      data: analytics
    });

  } catch (error) {
    logger.error('Get user model analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch model analytics',
      error: error.message
    });
  }
};

// Export middleware for file upload
exports.upload = upload;