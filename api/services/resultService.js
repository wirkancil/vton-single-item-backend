const { v4: uuidv4 } = require('uuid');
const { supabase, logger } = require('./supabaseService');

/**
 * Create result analytics record
 * @param {Object} analyticsData - Analytics data
 * @returns {Promise<Object>} Created analytics record
 */
async function createResultAnalytics(analyticsData) {
  try {
    const { userId, sessionId, metadata = {} } = analyticsData;

    logger.info(`Creating result analytics for session: ${sessionId}`);

    const analyticsId = uuidv4();
    const shareToken = generateShareToken();

    const { data, error } = await supabase
      .from('result_analytics')
      .insert({
        id: analyticsId,
        user_id: userId,
        session_id: sessionId,
        quality_score: metadata.qualityScore || 0.95,
        tags: metadata.tags || [],
        share_token: shareToken,
        view_count: 0,
        is_favorite: false,
        is_shared: false
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating result analytics:', error);
      throw new Error(`Failed to create result analytics: ${error.message}`);
    }

    logger.info(`Result analytics created successfully: ${analyticsId}`);
    return data;

  } catch (error) {
    logger.error('Create result analytics error:', error);
    throw error;
  }
}

/**
 * Get user's result gallery
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of results with analytics
 */
async function getUserResultGallery(userId, options = {}) {
  try {
    let query = supabase
      .from('result_analytics')
      .select(`
        *,
        try_on_history (
          id,
          garment_id,
          original_user_image_url,
          result_image_url,
          status,
          created_at,
          garments (
            id,
            name,
            brand,
            category,
            image_url
          )
        )
      `)
      .eq('user_id', userId);

    // Add filters
    if (options.isFavorite !== undefined) {
      query = query.eq('is_favorite', options.isFavorite);
    }
    if (options.isShared !== undefined) {
      query = query.eq('is_shared', options.isShared);
    }
    if (options.tags && options.tags.length > 0) {
      query = query.contains('tags', options.tags);
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
      logger.error('Error fetching result gallery:', error);
      throw new Error(`Failed to fetch result gallery: ${error.message}`);
    }

    // Transform data for response
    const transformedResults = (data || []).map(result => ({
      id: result.id,
      sessionId: result.session_id,
      viewCount: result.view_count,
      isFavorite: result.is_favorite,
      isShared: result.is_shared,
      shareToken: result.share_token,
      qualityScore: result.quality_score,
      userRating: result.user_rating,
      feedbackText: result.feedback_text,
      tags: result.tags,
      createdAt: result.created_at,
      updatedAt: result.updated_at,
      garment: result.try_on_history?.garments || null,
      originalImageUrl: result.try_on_history?.original_user_image_url,
      resultImageUrl: result.try_on_history?.result_image_url,
      sessionCreatedAt: result.try_on_history?.created_at
    }));

    return transformedResults;

  } catch (error) {
    logger.error('Get user result gallery error:', error);
    throw error;
  }
}

/**
 * Get result details by share token (public access)
 * @param {string} shareToken - Share token
 * @returns {Promise<Object|null>} Result details or null
 */
async function getResultByShareToken(shareToken) {
  try {
    logger.info(`Fetching result by share token: ${shareToken}`);

    const { data, error } = await supabase
      .from('result_analytics')
      .select(`
        *,
        try_on_history (
          id,
          result_image_url,
          created_at,
          garments (
            id,
            name,
            brand,
            category,
            image_url
          )
        )
      `)
      .eq('share_token', shareToken)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      logger.error('Error fetching result by share token:', error);
      throw new Error(`Failed to fetch result: ${error.message}`);
    }

    // Increment view count
    await supabase
      .from('result_analytics')
      .update({ view_count: data.view_count + 1 })
      .eq('id', data.id);

    // Transform for response
    const transformedResult = {
      id: data.id,
      sessionId: data.session_id,
      viewCount: data.view_count + 1,
      qualityScore: data.quality_score,
      tags: data.tags,
      createdAt: data.created_at,
      garment: data.try_on_history?.garments || null,
      resultImageUrl: data.try_on_history?.result_image_url,
      sessionCreatedAt: data.try_on_history?.created_at
    };

    return transformedResult;

  } catch (error) {
    logger.error('Get result by share token error:', error);
    throw error;
  }
}

/**
 * Update result analytics
 * @param {string} analyticsId - Analytics ID
 * @param {string} userId - User ID (for security)
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated analytics
 */
async function updateResultAnalytics(analyticsId, userId, updateData) {
  try {
    logger.info(`Updating result analytics: ${analyticsId} for user: ${userId}`);

    const { data, error } = await supabase
      .from('result_analytics')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('id', analyticsId)
      .eq('user_id', userId) // Security: ensure user can only update their own results
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Result analytics not found');
      }
      logger.error('Error updating result analytics:', error);
      throw new Error(`Failed to update result analytics: ${error.message}`);
    }

    logger.info(`Result analytics updated successfully: ${analyticsId}`);
    return data;

  } catch (error) {
    logger.error('Update result analytics error:', error);
    throw error;
  }
}

/**
 * Toggle favorite status
 * @param {string} analyticsId - Analytics ID
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Updated analytics
 */
async function toggleFavorite(analyticsId, userId) {
  try {
    // Get current status
    const { data: current } = await supabase
      .from('result_analytics')
      .select('is_favorite')
      .eq('id', analyticsId)
      .eq('user_id', userId)
      .single();

    if (!current) {
      throw new Error('Result not found');
    }

    // Toggle status
    return await updateResultAnalytics(analyticsId, userId, {
      is_favorite: !current.is_favorite
    });

  } catch (error) {
    logger.error('Toggle favorite error:', error);
    throw error;
  }
}

/**
 * Create share record
 * @param {string} analyticsId - Analytics ID
 * @param {string} userId - User ID
 * @param {Object} shareOptions - Share options
 * @returns {Promise<Object>} Share record
 */
async function createShare(analyticsId, userId, shareOptions = {}) {
  try {
    logger.info(`Creating share for analytics: ${analyticsId}`);

    const shareToken = generateShareToken();
    const expiresAt = shareOptions.expiresIn
      ? new Date(Date.now() + shareOptions.expiresIn * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Create share record
    const { data: shareRecord, error: shareError } = await supabase
      .from('result_shares')
      .insert({
        result_analytics_id: analyticsId,
        share_token: shareToken,
        platform: shareOptions.platform || 'general',
        expires_at: expiresAt,
        view_count: 0
      })
      .select()
      .single();

    if (shareError) {
      logger.error('Error creating share record:', shareError);
      throw new Error(`Failed to create share record: ${shareError.message}`);
    }

    // Update analytics to mark as shared
    await updateResultAnalytics(analyticsId, userId, {
      is_shared: true
    });

    logger.info(`Share created successfully: ${shareToken}`);
    return shareRecord;

  } catch (error) {
    logger.error('Create share error:', error);
    throw error;
  }
}

/**
 * Get user result analytics
 * @param {string} userId - User ID
 * @param {Object} options - Query options
 * @returns {Promise<Object>} Analytics summary
 */
async function getUserResultAnalytics(userId, options = {}) {
  try {
    const { startDate, endDate } = options;

    let query = supabase
      .from('result_analytics')
      .select('*')
      .eq('user_id', userId);

    // Add date filters
    if (startDate) {
      query = query.gte('created_at', startDate);
    }
    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching result analytics:', error);
      throw new Error(`Failed to fetch result analytics: ${error.message}`);
    }

    const results = data || [];

    // Calculate analytics
    const analytics = {
      totalResults: results.length,
      favoriteResults: results.filter(r => r.is_favorite).length,
      sharedResults: results.filter(r => r.is_shared).length,
      totalViews: results.reduce((sum, r) => sum + (r.view_count || 0), 0),
      avgQualityScore: results.length > 0
        ? results.reduce((sum, r) => sum + (r.quality_score || 0), 0) / results.length
        : 0,
      avgUserRating: results.filter(r => r.user_rating).length > 0
        ? results.filter(r => r.user_rating).reduce((sum, r) => sum + r.user_rating, 0) /
          results.filter(r => r.user_rating).length
        : 0,
      topTags: getTopTags(results),
      recentActivity: results.slice(0, 5).map(r => ({
        id: r.id,
        sessionId: r.session_id,
        createdAt: r.created_at,
        isFavorite: r.is_favorite
      }))
    };

    return analytics;

  } catch (error) {
    logger.error('Get user result analytics error:', error);
    throw error;
  }
}

/**
 * Delete result analytics and associated data
 * @param {string} analyticsId - Analytics ID
 * @param {string} userId - User ID (for security)
 * @returns {Promise<void>}
 */
async function deleteResultAnalytics(analyticsId, userId) {
  try {
    logger.info(`Deleting result analytics: ${analyticsId} for user: ${userId}`);

    // Delete associated shares first
    await supabase
      .from('result_shares')
      .delete()
      .eq('result_analytics_id', analyticsId);

    // Delete analytics record
    const { error } = await supabase
      .from('result_analytics')
      .delete()
      .eq('id', analyticsId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error deleting result analytics:', error);
      throw new Error(`Failed to delete result analytics: ${error.message}`);
    }

    logger.info(`Result analytics deleted successfully: ${analyticsId}`);

  } catch (error) {
    logger.error('Delete result analytics error:', error);
    throw error;
  }
}

// Helper function to generate share token
function generateShareToken() {
  return 'vton_' + Math.random().toString(36).substring(2, 15) +
         Math.random().toString(36).substring(2, 15);
}

// Helper function to get top tags
function getTopTags(results) {
  const tagCounts = {};

  results.forEach(result => {
    if (result.tags && Array.isArray(result.tags)) {
      result.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  return Object.entries(tagCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));
}

module.exports = {
  createResultAnalytics,
  getUserResultGallery,
  getResultByShareToken,
  updateResultAnalytics,
  toggleFavorite,
  createShare,
  getUserResultAnalytics,
  deleteResultAnalytics
};