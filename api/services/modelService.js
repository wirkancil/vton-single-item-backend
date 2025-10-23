const { v4: uuidv4 } = require('uuid');
const { supabase, uploadImage, deleteImage, logger } = require('./supabaseService');

/**
 * Create user face model
 * @param {Object} faceData - Face model data
 * @returns {Promise<Object>} Created face model
 */
async function createFaceModel(faceData) {
  try {
    const { userId, modelImage, modelName, metadata = {} } = faceData;

    logger.info(`Creating face model for user: ${userId}`);

    // Upload face model image to storage
    const modelId = uuidv4();
    const modelPath = `models/user-faces/${userId}/${modelId}_model.png`;
    let modelImageUrl;

    if (modelImage) {
      modelImageUrl = await uploadImage(modelPath, modelImage, 'image/png');
    }

    // Create face model record
    const { data, error } = await supabase
      .from('user_face_models')
      .insert({
        id: modelId,
        user_id: userId,
        model_name: modelName || 'default',
        model_path: modelPath,
        face_features: metadata.faceFeatures || {},
        accuracy_score: metadata.accuracyScore || 0.95,
        training_images: metadata.trainingImages || [],
        is_active: true,
        metadata: metadata
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating face model:', error);
      throw new Error(`Failed to create face model: ${error.message}`);
    }

    logger.info(`Face model created successfully: ${modelId}`);
    return data;

  } catch (error) {
    logger.error('Create face model error:', error);
    throw error;
  }
}

/**
 * Get user's face models
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of face models
 */
async function getUserFaceModels(userId, options = {}) {
  try {
    let query = supabase
      .from('user_face_models')
      .select('*')
      .eq('user_id', userId);

    // Add filters
    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }

    // Order by creation date
    query = query.order('created_at', { ascending: false });

    // Add pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching face models:', error);
      throw new Error(`Failed to fetch face models: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    logger.error('Get user face models error:', error);
    throw error;
  }
}

/**
 * Update face model
 * @param {string} modelId - Model ID
 * @param {string} userId - User ID (for security)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated face model
 */
async function updateFaceModel(modelId, userId, updateData) {
  try {
    logger.info(`Updating face model: ${modelId} for user: ${userId}`);

    const { data, error } = await supabase
      .from('user_face_models')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', modelId)
      .eq('user_id', userId) // Security: ensure user can only update their own models
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Face model not found');
      }
      logger.error('Error updating face model:', error);
      throw new Error(`Failed to update face model: ${error.message}`);
    }

    logger.info(`Face model updated successfully: ${modelId}`);
    return data;

  } catch (error) {
    logger.error('Update face model error:', error);
    throw error;
  }
}

/**
 * Delete face model
 * @param {string} modelId - Model ID
 * @param {string} userId - User ID (for security)
 * @returns {Promise<void>}
 */
async function deleteFaceModel(modelId, userId) {
  try {
    logger.info(`Deleting face model: ${modelId} for user: ${userId}`);

    // Get model details to clean up storage
    const { data: model } = await supabase
      .from('user_face_models')
      .select('model_path')
      .eq('id', modelId)
      .eq('user_id', userId)
      .single();

    // Delete from storage
    if (model?.model_path) {
      await deleteImage(model.model_path);
    }

    // Delete from database
    const { error } = await supabase
      .from('user_face_models')
      .delete()
      .eq('id', modelId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error deleting face model:', error);
      throw new Error(`Failed to delete face model: ${error.message}`);
    }

    logger.info(`Face model deleted successfully: ${modelId}`);

  } catch (error) {
    logger.error('Delete face model error:', error);
    throw error;
  }
}

/**
 * Create user size profile
 * @param {Object} profileData - Size profile data
 * @returns {Promise<Object>} Created size profile
 */
async function createSizeProfile(profileData) {
  try {
    const { userId, profileName, bodyMeasurements, sizePreferences, metadata = {} } = profileData;

    logger.info(`Creating size profile for user: ${userId}`);

    const profileId = uuidv4();

    const { data, error } = await supabase
      .from('user_size_profiles')
      .insert({
        id: profileId,
        user_id: userId,
        profile_name: profileName || 'default',
        body_measurements: bodyMeasurements || {},
        size_preferences: sizePreferences || {},
        recommended_sizes: metadata.recommendedSizes || {},
        body_shape: metadata.bodyShape,
        confidence_score: metadata.confidenceScore || 0.9,
        is_active: true
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating size profile:', error);
      throw new Error(`Failed to create size profile: ${error.message}`);
    }

    logger.info(`Size profile created successfully: ${profileId}`);
    return data;

  } catch (error) {
    logger.error('Create size profile error:', error);
    throw error;
  }
}

/**
 * Get user's size profiles
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of size profiles
 */
async function getUserSizeProfiles(userId, options = {}) {
  try {
    let query = supabase
      .from('user_size_profiles')
      .select('*')
      .eq('user_id', userId);

    // Add filters
    if (options.isActive !== undefined) {
      query = query.eq('is_active', options.isActive);
    }

    // Order by creation date
    query = query.order('created_at', { ascending: false });

    // Add pagination
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching size profiles:', error);
      throw new Error(`Failed to fetch size profiles: ${error.message}`);
    }

    return data || [];

  } catch (error) {
    logger.error('Get user size profiles error:', error);
    throw error;
  }
}

/**
 * Update size profile
 * @param {string} profileId - Profile ID
 * @param {string} userId - User ID (for security)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated size profile
 */
async function updateSizeProfile(profileId, userId, updateData) {
  try {
    logger.info(`Updating size profile: ${profileId} for user: ${userId}`);

    const { data, error } = await supabase
      .from('user_size_profiles')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', profileId)
      .eq('user_id', userId) // Security: ensure user can only update their own profiles
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Size profile not found');
      }
      logger.error('Error updating size profile:', error);
      throw new Error(`Failed to update size profile: ${error.message}`);
    }

    logger.info(`Size profile updated successfully: ${profileId}`);
    return data;

  } catch (error) {
    logger.error('Update size profile error:', error);
    throw error;
  }
}

/**
 * Delete size profile
 * @param {string} profileId - Profile ID
 * @param {string} userId - User ID (for security)
 * @returns {Promise<void>}
 */
async function deleteSizeProfile(profileId, userId) {
  try {
    logger.info(`Deleting size profile: ${profileId} for user: ${userId}`);

    const { error } = await supabase
      .from('user_size_profiles')
      .delete()
      .eq('id', profileId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error deleting size profile:', error);
      throw new Error(`Failed to delete size profile: ${error.message}`);
    }

    logger.info(`Size profile deleted successfully: ${profileId}`);

  } catch (error) {
    logger.error('Delete size profile error:', error);
    throw error;
  }
}

/**
 * Get user model analytics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Model analytics data
 */
async function getUserModelAnalytics(userId) {
  try {
    // Get counts and stats
    const [faceModelsResult, sizeProfilesResult] = await Promise.all([
      supabase
        .from('user_face_models')
        .select('id, accuracy_score, created_at, is_active')
        .eq('user_id', userId),
      supabase
        .from('user_size_profiles')
        .select('id, confidence_score, created_at, is_active')
        .eq('user_id', userId)
    ]);

    const faceModels = faceModelsResult.data || [];
    const sizeProfiles = sizeProfilesResult.data || [];

    const analytics = {
      faceModels: {
        total: faceModels.length,
        active: faceModels.filter(m => m.is_active).length,
        avgAccuracy: faceModels.length > 0
          ? faceModels.reduce((sum, m) => sum + (m.accuracy_score || 0), 0) / faceModels.length
          : 0,
        latestModel: faceModels.length > 0 ? faceModels[0].created_at : null
      },
      sizeProfiles: {
        total: sizeProfiles.length,
        active: sizeProfiles.filter(p => p.is_active).length,
        avgConfidence: sizeProfiles.length > 0
          ? sizeProfiles.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / sizeProfiles.length
          : 0,
        latestProfile: sizeProfiles.length > 0 ? sizeProfiles[0].created_at : null
      },
      lastUpdated: new Date().toISOString()
    };

    return analytics;

  } catch (error) {
    logger.error('Get user model analytics error:', error);
    throw error;
  }
}

module.exports = {
  createFaceModel,
  getUserFaceModels,
  updateFaceModel,
  deleteFaceModel,
  createSizeProfile,
  getUserSizeProfiles,
  updateSizeProfile,
  deleteSizeProfile,
  getUserModelAnalytics
};