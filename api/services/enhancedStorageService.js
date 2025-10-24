/**
 * Enhanced Storage Service
 * Improved image upload with proper authentication and error handling
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./supabaseService');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Storage bucket configuration
const STORAGE_BUCKET = 'vton-assets';

/**
 * Upload image to Supabase storage with proper authentication
 * @param {Buffer|string} imageBuffer - Image buffer or file path
 * @param {string} fileName - Desired file name
 * @param {string} contentType - MIME type of the image
 * @param {string} folder - Storage folder path
 * @returns {Promise<string>} Public URL of uploaded image
 */
async function uploadImageToSupabase(imageBuffer, fileName, contentType = 'image/jpeg', folder = 'vton-sessions') {
  try {
    // Validate inputs
    if (!imageBuffer || !fileName) {
      throw new Error('Image buffer and fileName are required');
    }

    // If imageBuffer is a file path, read the file
    if (typeof imageBuffer === 'string' && fs.existsSync(imageBuffer)) {
      imageBuffer = fs.readFileSync(imageBuffer);

      // Detect content type from file extension if not provided
      if (!contentType) {
        const ext = path.extname(fileName).toLowerCase();
        const mimeTypes = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp'
        };
        contentType = mimeTypes[ext] || 'image/jpeg';
      }
    }

    // Generate unique file name to avoid conflicts
    const timestamp = Date.now();
    const uniqueId = uuidv4().slice(0, 8);
    const uniqueFileName = `${folder}/${timestamp}-${uniqueId}-${fileName}`;

    // Construct storage URL
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${uniqueFileName}`;

    // Prepare headers with service role key for admin operations
    const headers = {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': contentType
    };

    logger.info(`Uploading image to Supabase: ${uniqueFileName} (${imageBuffer.length} bytes)`);

    // Upload to Supabase storage
    const response = await axios.post(storageUrl, imageBuffer, {
      headers,
      timeout: 60000, // 60 seconds timeout
      maxContentLength: 50 * 1024 * 1024, // 50MB max file size
      validateStatus: function (status) {
        return status >= 200 && status < 300;
      }
    });

    if (response.status >= 200 && response.status < 300) {
      // Construct public URL
      const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${uniqueFileName}`;

      logger.info(`Successfully uploaded image: ${publicUrl}`);
      return {
        url: publicUrl,
        path: uniqueFileName,
        size: imageBuffer.length,
        contentType: contentType
      };
    } else {
      throw new Error(`Upload failed with status ${response.status}: ${response.statusText}`);
    }

  } catch (error) {
    logger.error('Failed to upload image to Supabase:', {
      message: error.message,
      fileName: fileName,
      folder: folder,
      status: error.response?.status,
      data: error.response?.data
    });

    // Provide detailed error messages
    let errorMessage = 'Failed to upload image';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = `Invalid upload request: ${data?.message || 'Bad request'}`;
          break;
        case 401:
          errorMessage = 'Authentication failed - check Supabase credentials';
          break;
        case 403:
          errorMessage = 'Access denied - check RLS policies and bucket permissions';
          break;
        case 413:
          errorMessage = 'File too large - maximum size is 50MB';
          break;
        case 422:
          errorMessage = `Invalid file format or data: ${data?.message || 'Unprocessable entity'}`;
          break;
        default:
          errorMessage = `Upload error (${status}): ${data?.message || error.message}`;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Upload timeout - file may be too large or connection issues';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Supabase storage';
    } else {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Upload image from file path
 * @param {string} filePath - Local file path
 * @param {string} fileName - Optional custom file name
 * @param {string} folder - Storage folder path
 * @returns {Promise<Object>} Upload result with URL and metadata
 */
async function uploadImageFromFile(filePath, fileName = null, folder = 'vton-sessions') {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Use original file name if not provided
    if (!fileName) {
      fileName = path.basename(filePath);
    }

    // Get file stats
    const stats = fs.statSync(filePath);

    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
      throw new Error('File too large - maximum size is 50MB');
    }

    return await uploadImageToSupabase(filePath, fileName, undefined, folder);

  } catch (error) {
    logger.error('Failed to upload image from file:', {
      message: error.message,
      filePath: filePath
    });
    throw error;
  }
}

/**
 * Delete image from Supabase storage
 * @param {string} imagePath - Storage path (not full URL)
 * @returns {Promise<boolean>} Success status
 */
async function deleteImage(imagePath) {
  try {
    if (!imagePath) {
      throw new Error('Image path is required');
    }

    const storageUrl = `${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${imagePath}`;

    const headers = {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    };

    const response = await axios.delete(storageUrl, {
      headers,
      timeout: 30000
    });

    if (response.status >= 200 && response.status < 300) {
      logger.info(`Successfully deleted image: ${imagePath}`);
      return true;
    } else {
      throw new Error(`Delete failed with status ${response.status}`);
    }

  } catch (error) {
    logger.error('Failed to delete image:', {
      message: error.message,
      imagePath: imagePath,
      status: error.response?.status
    });
    return false;
  }
}

/**
 * Check if image exists in storage
 * @param {string} imagePath - Storage path
 * @returns {Promise<boolean>} True if image exists
 */
async function imageExists(imagePath) {
  try {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${imagePath}`;

    const response = await axios.head(publicUrl, {
      timeout: 10000
    });

    return response.status === 200;

  } catch (error) {
    return false;
  }
}

/**
 * Create signed URL for private access
 * @param {string} imagePath - Storage path
 * @param {number} expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} Signed URL
 */
async function createSignedUrl(imagePath, expiresIn = 3600) {
  try {
    const storageUrl = `${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${imagePath}`;

    const headers = {
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json'
    };

    const data = {
      expiresIn: expiresIn
    };

    const response = await axios.post(storageUrl, data, {
      headers,
      timeout: 10000
    });

    if (response.data?.signedUrl) {
      return response.data.signedUrl;
    } else {
      throw new Error('No signed URL returned from Supabase');
    }

  } catch (error) {
    logger.error('Failed to create signed URL:', {
      message: error.message,
      imagePath: imagePath
    });
    throw error;
  }
}

/**
 * Batch upload multiple images
 * @param {Array} imageList - Array of {buffer, fileName, contentType} objects
 * @param {string} folder - Storage folder path
 * @returns {Promise<Array>} Array of upload results
 */
async function batchUploadImages(imageList, folder = 'vton-sessions') {
  try {
    const uploadPromises = imageList.map((image, index) => {
      return uploadImageToSupabase(
        image.buffer,
        image.fileName || `image-${index + 1}`,
        image.contentType,
        folder
      );
    });

    const results = await Promise.allSettled(uploadPromises);

    const successful = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failed = results.filter(r => r.status === 'rejected').map(r => r.reason);

    if (failed.length > 0) {
      logger.warn('Some uploads failed in batch:', {
        successful: successful.length,
        failed: failed.length,
        errors: failed.map(f => f.message)
      });
    }

    return {
      successful,
      failed,
      total: imageList.length
    };

  } catch (error) {
    logger.error('Batch upload failed:', {
      message: error.message,
      count: imageList.length
    });
    throw error;
  }
}

module.exports = {
  uploadImageToSupabase,
  uploadImageFromFile,
  deleteImage,
  imageExists,
  createSignedUrl,
  batchUploadImages
};