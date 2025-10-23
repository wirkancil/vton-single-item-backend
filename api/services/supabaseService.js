const { createClient } = require('@supabase/supabase-js');
const winston = require('winston');

// Setup logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Supabase client configuration
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

// Create Supabase client with service role key (for admin operations)
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Create Supabase client with anon key (for public operations)
const supabaseAnon = createClient(
  supabaseUrl,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Upload image to Supabase Storage
 * @param {string} path - Storage path
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} contentType - MIME type
 * @returns {Promise<string>} Public URL of uploaded file
 */
async function uploadImage(path, fileBuffer, contentType) {
  try {
    logger.info(`Uploading image to path: ${path}`);

    const { data, error } = await supabase.storage
      .from('vton-assets')
      .upload(path, fileBuffer, {
        contentType: contentType,
        upsert: true
      });

    if (error) {
      logger.error('Error uploading image:', error);
      throw new Error(`Failed to upload image: ${error.message}`);
    }

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from('vton-assets')
      .getPublicUrl(path);

    logger.info(`Image uploaded successfully: ${publicUrl}`);
    return publicUrl;
  } catch (error) {
    logger.error('Upload error:', error);
    throw error;
  }
}

/**
 * Delete image from Supabase Storage
 * @param {string} path - Storage path to delete
 */
async function deleteImage(path) {
  try {
    logger.info(`Deleting image: ${path}`);

    const { error } = await supabase.storage
      .from('vton-assets')
      .remove([path]);

    if (error) {
      logger.error('Error deleting image:', error);
      throw new Error(`Failed to delete image: ${error.message}`);
    }

    logger.info(`Image deleted successfully: ${path}`);
  } catch (error) {
    logger.error('Delete error:', error);
    throw error;
  }
}

/**
 * Get garment by ID
 * @param {string} garmentId - Garment UUID
 * @returns {Promise<Object>} Garment data
 */
async function getGarmentById(garmentId) {
  try {
    const { data, error } = await supabase
      .from('garments')
      .select('*')
      .eq('id', garmentId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Garment not found');
      }
      logger.error('Error fetching garment:', error);
      throw new Error(`Failed to fetch garment: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Get garment error:', error);
    throw error;
  }
}

/**
 * Get all garments
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of garments
 */
async function getAllGarments(options = {}) {
  try {
    let query = supabase
      .from('garments')
      .select('*');

    // Add filters if provided
    if (options.category) {
      query = query.eq('category', options.category);
    }
    if (options.brand) {
      query = query.eq('brand', options.brand);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching garments:', error);
      throw new Error(`Failed to fetch garments: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    logger.error('Get garments error:', error);
    throw error;
  }
}

/**
 * Create try-on session record
 * @param {Object} sessionData - Session data
 * @returns {Promise<Object>} Created session record
 */
async function createTryOnSession(sessionData) {
  try {
    const { data, error } = await supabase
      .from('try_on_history')
      .insert(sessionData)
      .select()
      .single();

    if (error) {
      logger.error('Error creating try-on session:', error);
      throw new Error(`Failed to create try-on session: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Create session error:', error);
    throw error;
  }
}

/**
 * Update try-on session status
 * @param {string} sessionId - Session UUID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated session record
 */
async function updateTryOnSession(sessionId, updateData) {
  try {
    const { data, error } = await supabase
      .from('try_on_history')
      .update(updateData)
      .eq('id', sessionId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating try-on session:', error);
      throw new Error(`Failed to update try-on session: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Update session error:', error);
    throw error;
  }
}

/**
 * Get try-on session by ID (with user verification)
 * @param {string} sessionId - Session UUID
 * @param {string} userId - User UUID for security
 * @returns {Promise<Object>} Session data
 */
async function getTryOnSessionById(sessionId, userId) {
  try {
    const { data, error } = await supabase
      .from('try_on_history')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId) // Security: ensure user can only access their own sessions
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error('Session not found');
      }
      logger.error('Error fetching try-on session:', error);
      throw new Error(`Failed to fetch try-on session: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Get session error:', error);
    throw error;
  }
}

/**
 * Get user's try-on history
 * @param {string} userId - User UUID
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of try-on sessions
 */
async function getUserTryOnHistory(userId, options = {}) {
  try {
    let query = supabase
      .from('try_on_history')
      .select(`
        *,
        garments (
          id,
          name,
          brand,
          category,
          image_url
        )
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    // Add filters if provided
    if (options.status) {
      query = query.eq('status', options.status);
    }
    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
    }

    const { data, error } = await query;

    if (error) {
      logger.error('Error fetching try-on history:', error);
      throw new Error(`Failed to fetch try-on history: ${error.message}`);
    }

    return data || [];
  } catch (error) {
    logger.error('Get history error:', error);
    throw error;
  }
}

/**
 * Delete try-on session and associated files
 * @param {string} sessionId - Session UUID
 * @param {string} userId - User UUID for security
 */
async function deleteTryOnSession(sessionId, userId) {
  try {
    // First get session details to clean up files
    const session = await getTryOnSessionById(sessionId, userId);

    // Delete associated files from storage
    const filesToDelete = [];

    if (session.original_user_image_url) {
      // Extract path from URL
      const urlParts = session.original_user_image_url.split('/');
      const filePath = urlParts.slice(-2).join('/');
      filesToDelete.push(filePath);
    }

    if (session.result_image_url) {
      const urlParts = session.result_image_url.split('/');
      const filePath = urlParts.slice(-2).join('/');
      filesToDelete.push(filePath);
    }

    // Delete files if any
    if (filesToDelete.length > 0) {
      await deleteImages(filesToDelete);
    }

    // Delete database record
    const { error } = await supabase
      .from('try_on_history')
      .delete()
      .eq('id', sessionId)
      .eq('user_id', userId);

    if (error) {
      logger.error('Error deleting try-on session:', error);
      throw new Error(`Failed to delete try-on session: ${error.message}`);
    }

    logger.info(`Try-on session ${sessionId} deleted successfully`);
  } catch (error) {
    logger.error('Delete session error:', error);
    throw error;
  }
}

/**
 * Delete multiple images from storage
 * @param {Array<string>} paths - Array of storage paths
 */
async function deleteImages(paths) {
  try {
    if (paths.length === 0) return;

    const { error } = await supabase.storage
      .from('vton-assets')
      .remove(paths);

    if (error) {
      logger.error('Error deleting images:', error);
      throw new Error(`Failed to delete images: ${error.message}`);
    }
  } catch (error) {
    logger.error('Delete images error:', error);
    throw error;
  }
}

/**
 * Create job tracking record
 * @param {Object} jobData - Job tracking data
 * @returns {Promise<Object>} Created job record
 */
async function createJobRecord(jobData) {
  try {
    const { data, error } = await supabase
      .from('pixazo_jobs')
      .insert(jobData)
      .select()
      .single();

    if (error) {
      logger.error('Error creating job record:', error);
      throw new Error(`Failed to create job record: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Create job record error:', error);
    throw error;
  }
}

/**
 * Update job tracking record
 * @param {string} jobId - Job ID
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Updated job record
 */
async function updateJobRecord(jobId, updateData) {
  try {
    const { data, error } = await supabase
      .from('pixazo_jobs')
      .update({
        ...updateData,
        updated_at: new Date().toISOString()
      })
      .eq('job_id', jobId)
      .select()
      .single();

    if (error) {
      logger.error('Error updating job record:', error);
      throw new Error(`Failed to update job record: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Update job record error:', error);
    throw error;
  }
}

/**
 * Get try-on session by Pixazo job ID
 * @param {string} jobId - Pixazo job ID
 * @returns {Promise<Object|null>} Session data or null
 */
async function getTryOnSessionByJobId(jobId) {
  try {
    const { data, error } = await supabase
      .from('pixazo_jobs')
      .select(`
        *,
        try_on_history!inner(
          id,
          user_id,
          garment_id,
          status,
          original_user_image_url,
          result_image_url,
          error_message,
          created_at,
          updated_at
        )
      `)
      .eq('job_id', jobId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Job not found
      }
      logger.error('Error fetching session by job ID:', error);
      throw new Error(`Failed to fetch session by job ID: ${error.message}`);
    }

    // Return the try_on_history data
    return data.try_on_history;
  } catch (error) {
    logger.error('Get session by job ID error:', error);
    throw error;
  }
}

/**
 * Link Pixazo job to try-on session
 * @param {string} sessionId - Try-on session ID
 * @param {string} jobId - Pixazo job ID
 * @param {Object} additionalData - Additional job data
 * @returns {Promise<Object>} Created job link
 */
async function linkJobToSession(sessionId, jobId, additionalData = {}) {
  try {
    const { data, error } = await supabase
      .from('pixazo_jobs')
      .insert({
        job_id: jobId,
        session_id: sessionId,
        status: 'queued',
        ...additionalData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      logger.error('Error linking job to session:', error);
      throw new Error(`Failed to link job to session: ${error.message}`);
    }

    return data;
  } catch (error) {
    logger.error('Link job to session error:', error);
    throw error;
  }
}

module.exports = {
  supabase,
  supabaseAnon,
  uploadImage,
  deleteImage,
  getGarmentById,
  getAllGarments,
  createTryOnSession,
  updateTryOnSession,
  getTryOnSessionById,
  getUserTryOnHistory,
  deleteTryOnSession,
  deleteImages,
  createJobRecord,
  updateJobRecord,
  getTryOnSessionByJobId,
  linkJobToSession,
  logger
};