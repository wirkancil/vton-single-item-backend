const { supabase, logger } = require('./supabaseService');

/**
 * Track storage usage
 * @param {Object} usageData - Storage usage data
 * @returns {Promise<Object>} Created usage record
 */
async function trackStorageUsage(usageData) {
  try {
    const { userId, bucketName, fileType, fileSize, filePath } = usageData;

    logger.info(`Tracking storage usage: ${bucketName}/${filePath} for user: ${userId}`);

    const { data, error } = await supabase
      .from('storage_usage')
      .insert({
        user_id: userId,
        bucket_name: bucketName,
        file_type: fileType,
        file_size: fileSize,
        file_path: filePath,
        is_archived: false
      })
      .select()
      .single();

    if (error) {
      // Don't fail if tracking fails, just log warning
      logger.warn('Failed to track storage usage:', error.message);
      return null;
    }

    return data;

  } catch (error) {
    logger.warn('Track storage usage error:', error);
    return null; // Don't fail the main operation
  }
}

/**
 * Get user storage usage statistics
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Storage usage statistics
 */
async function getUserStorageUsage(userId) {
  try {
    logger.info(`Getting storage usage for user: ${userId}`);

    const { data, error } = await supabase
      .from('storage_usage')
      .select('bucket_name, file_type, file_size, is_archived, created_at')
      .eq('user_id', userId);

    if (error) {
      logger.error('Error fetching storage usage:', error);
      throw new Error(`Failed to fetch storage usage: ${error.message}`);
    }

    const usage = data || [];

    // Calculate statistics
    const totalBytes = usage.filter(u => !u.is_archived).reduce((sum, u) => sum + (u.file_size || 0), 0);
    const archivedBytes = usage.filter(u => u.is_archived).reduce((sum, u) => sum + (u.file_size || 0), 0);

    // Group by file type
    const usageByType = {};
    usage.filter(u => !u.is_archived).forEach(u => {
      usageByType[u.file_type] = (usageByType[u.file_type] || 0) + (u.file_size || 0);
    });

    // Group by bucket
    const usageByBucket = {};
    usage.filter(u => !u.is_archived).forEach(u => {
      usageByBucket[u.bucket_name] = (usageByBucket[u.bucket_name] || 0) + (u.file_size || 0);
    });

    // File count
    const totalFiles = usage.filter(u => !u.is_archived).length;
    const archivedFiles = usage.filter(u => u.is_archived).length;

    return {
      totalBytes,
      archivedBytes,
      totalFiles,
      archivedFiles,
      usageByType,
      usageByBucket,
      totalMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
      archivedMB: Math.round(archivedBytes / (1024 * 1024) * 100) / 100,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Get user storage usage error:', error);
    throw error;
  }
}

/**
 * Cleanup old storage files
 * @param {string} userId - User ID
 * @param {Object} options - Cleanup options
 * @returns {Promise<Object>} Cleanup results
 */
async function cleanupOldFiles(userId, options = {}) {
  try {
    const { olderThanDays = 30, fileTypes, keepFavorites = true } = options;

    logger.info(`Cleaning up old files for user: ${userId}, older than ${olderThanDays} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    // Get files to cleanup
    let query = supabase
      .from('storage_usage')
      .select('id, file_path, bucket_name, file_type, file_size')
      .eq('user_id', userId)
      .eq('is_archived', false)
      .lt('created_at', cutoffDate.toISOString());

    if (fileTypes && fileTypes.length > 0) {
      query = query.in('file_type', fileTypes);
    }

    const { data: oldFiles, error } = await query;

    if (error) {
      logger.error('Error fetching old files for cleanup:', error);
      throw new Error(`Failed to fetch old files: ${error.message}`);
    }

    const filesToCleanup = oldFiles || [];
    let cleanedFiles = 0;
    let cleanedBytes = 0;
    let errors = [];

    // Archive and delete files
    for (const file of filesToCleanup) {
      try {
        // Delete from Supabase Storage
        const { error: deleteError } = await supabase.storage
          .from(file.bucket_name)
          .remove([file.file_path]);

        if (deleteError) {
          logger.warn(`Failed to delete file ${file.file_path}:`, deleteError.message);
          errors.push(`Failed to delete ${file.file_path}: ${deleteError.message}`);
          continue;
        }

        // Mark as archived in database
        await supabase
          .from('storage_usage')
          .update({ is_archived: true })
          .eq('id', file.id);

        cleanedFiles++;
        cleanedBytes += file.file_size || 0;

        logger.info(`Cleaned up file: ${file.file_path}`);

      } catch (fileError) {
        logger.error(`Error cleaning up file ${file.file_path}:`, fileError);
        errors.push(`Error cleaning up ${file.file_path}: ${fileError.message}`);
      }
    }

    const results = {
      success: true,
      cleanedFiles,
      cleanedBytes,
      cleanedMB: Math.round(cleanedBytes / (1024 * 1024) * 100) / 100,
      errors: errors.length,
      errorDetails: errors,
      cutoffDate: cutoffDate.toISOString()
    };

    logger.info(`Cleanup completed for user ${userId}:`, results);
    return results;

  } catch (error) {
    logger.error('Cleanup old files error:', error);
    throw error;
  }
}

/**
 * Optimize storage (compress images, archive old results)
 * @param {string} userId - User ID
 * @returns {Promise<Object>} Optimization results
 */
async function optimizeStorage(userId) {
  try {
    logger.info(`Optimizing storage for user: ${userId}`);

    // Get current storage usage
    const usage = await getUserStorageUsage(userId);

    const optimizationResults = {
      currentUsage: usage,
      optimizations: [],
      totalSavedBytes: 0,
      totalSavedMB: 0
    };

    // Optimization 1: Archive old try-on results (older than 90 days)
    try {
      const oldResultsCleanup = await cleanupOldFiles(userId, {
        olderThanDays: 90,
        fileTypes: ['result']
      });

      if (oldResultsCleanup.cleanedFiles > 0) {
        optimizationResults.optimizations.push({
          type: 'archive_old_results',
          description: `Archived ${oldResultsCleanup.cleanedFiles} old result files`,
          savedBytes: oldResultsCleanup.cleanedBytes
        });
        optimizationResults.totalSavedBytes += oldResultsCleanup.cleanedBytes;
      }
    } catch (error) {
      logger.warn('Failed to cleanup old results:', error);
    }

    // Optimization 2: Could add image compression here
    // This would require an image processing service

    optimizationResults.totalSavedMB = Math.round(
      optimizationResults.totalSavedBytes / (1024 * 1024) * 100
    ) / 100;

    optimizationResults.newUsage = await getUserStorageUsage(userId);
    optimizationResults.optimizedAt = new Date().toISOString();

    logger.info(`Storage optimization completed for user ${userId}:`, optimizationResults);
    return optimizationResults;

  } catch (error) {
    logger.error('Optimize storage error:', error);
    throw error;
  }
}

/**
 * Get global storage statistics (admin only)
 * @returns {Promise<Object>} Global storage statistics
 */
async function getGlobalStorageStats() {
  try {
    logger.info('Getting global storage statistics');

    const { data, error } = await supabase
      .from('storage_usage')
      .select('bucket_name, file_type, file_size, is_archived, user_id');

    if (error) {
      logger.error('Error fetching global storage stats:', error);
      throw new Error(`Failed to fetch global storage stats: ${error.message}`);
    }

    const usage = data || [];

    // Calculate global statistics
    const totalBytes = usage.filter(u => !u.is_archived).reduce((sum, u) => sum + (u.file_size || 0), 0);
    const archivedBytes = usage.filter(u => u.is_archived).reduce((sum, u) => sum + (u.file_size || 0), 0);

    // Group by file type
    const usageByType = {};
    usage.filter(u => !u.is_archived).forEach(u => {
      usageByType[u.file_type] = (usageByType[u.file_type] || 0) + (u.file_size || 0);
    });

    // Group by bucket
    const usageByBucket = {};
    usage.filter(u => !u.is_archived).forEach(u => {
      usageByBucket[u.bucket_name] = (usageByBucket[u.bucket_name] || 0) + (u.file_size || 0);
    });

    // User statistics
    const uniqueUsers = new Set(usage.map(u => u.user_id)).size;
    const userUsageMap = {};

    usage.filter(u => !u.is_archived).forEach(u => {
      if (!userUsageMap[u.user_id]) {
        userUsageMap[u.user_id] = 0;
      }
      userUsageMap[u.user_id] += u.file_size || 0;
    });

    // Find top users
    const topUsers = Object.entries(userUsageMap)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([userId, bytes]) => ({
        userId,
        bytes,
        mb: Math.round(bytes / (1024 * 1024) * 100) / 100
      }));

    return {
      totalBytes,
      archivedBytes,
      totalFiles: usage.filter(u => !u.is_archived).length,
      uniqueUsers,
      usageByType,
      usageByBucket,
      topUsers,
      totalMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
      archivedMB: Math.round(archivedBytes / (1024 * 1024) * 100) / 100,
      avgUsagePerUser: uniqueUsers > 0 ? Math.round(totalBytes / uniqueUsers / (1024 * 1024) * 100) / 100 : 0,
      lastUpdated: new Date().toISOString()
    };

  } catch (error) {
    logger.error('Get global storage stats error:', error);
    throw error;
  }
}

/**
 * Get bucket information
 * @returns {Promise<Array>} Array of bucket information
 */
async function getBucketInfo() {
  try {
    logger.info('Getting bucket information');

    // This would typically use Supabase admin API to get bucket info
    // For now, return known buckets
    const knownBuckets = [
      {
        name: 'vton-assets',
        public: true,
        fileCount: null, // Would need to be calculated
        totalSize: null, // Would need to be calculated
        created_at: new Date().toISOString()
      }
    ];

    return knownBuckets;

  } catch (error) {
    logger.error('Get bucket info error:', error);
    throw error;
  }
}

module.exports = {
  trackStorageUsage,
  getUserStorageUsage,
  cleanupOldFiles,
  optimizeStorage,
  getGlobalStorageStats,
  getBucketInfo
};