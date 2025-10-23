const axios = require('axios');
const { logger } = require('./supabaseService');

// FASHN API configuration
const FASHN_API_URL = process.env.FASHN_API_URL || 'https://api.fashn.ai/v1';
const FASHN_API_KEY = process.env.FASHN_API_KEY;

if (!FASHN_API_KEY) {
  logger.warn('FASHN_API_KEY not configured. FASHN service will not work.');
}

// Create Axios instance with default configuration
const fashnClient = axios.create({
  baseURL: FASHN_API_URL,
  timeout: 300000, // 5 minutes timeout for AI processing
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor to add API key
fashnClient.interceptors.request.use(
  (config) => {
    if (FASHN_API_KEY) {
      config.headers['Authorization'] = `Bearer ${FASHN_API_KEY}`;
    }
    logger.info(`Making FASHN API request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('FASHN request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
fashnClient.interceptors.response.use(
  (response) => {
    logger.info(`FASHN API response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    logger.error(`FASHN API error: ${status} ${url}`, {
      message: error.message,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

/**
 * Convert file buffer to base64 string with proper prefix
 * @param {Buffer} buffer - File buffer
 * @param {string} mimeType - MIME type
 * @returns {string} Base64 string with prefix
 */
function bufferToBase64(buffer, mimeType) {
  const base64 = buffer.toString('base64');
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Perform virtual try-on using FASHN API
 * @param {string|Buffer} modelImage - Model image URL or buffer
 * @param {string|Buffer} garmentImage - Garment image URL or buffer
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Result data
 */
async function performVirtualTryOn(modelImage, garmentImage, options = {}) {
  try {
    if (!FASHN_API_KEY) {
      throw new Error('FASHN API key not configured');
    }

    logger.info(`Starting FASHN VTON process`);

    // Prepare model image
    let modelImageData;
    if (typeof modelImage === 'string') {
      modelImageData = modelImage; // URL
    } else if (Buffer.isBuffer(modelImage)) {
      modelImageData = bufferToBase64(modelImage, 'image/png');
    } else {
      throw new Error('Invalid model image format. Expected URL or Buffer.');
    }

    // Prepare garment image
    let garmentImageData;
    if (typeof garmentImage === 'string') {
      garmentImageData = garmentImage; // URL
    } else if (Buffer.isBuffer(garmentImage)) {
      garmentImageData = bufferToBase64(garmentImage, 'image/png');
    } else {
      throw new Error('Invalid garment image format. Expected URL or Buffer.');
    }

    // Prepare request data
    const requestData = {
      model_name: options.model_name || 'tryon-v1.6', // High quality 864x1296
      inputs: {
        model_image: modelImageData,
        garment_image: garmentImageData,
        // Optional parameters
        category: options.category || 'auto',
        garment_photo_type: options.garment_photo_type || 'auto',
        num_samples: options.num_samples || 1,
        seed: options.seed || undefined,
        segmentation_free: options.segmentation_free !== false,
        moderation_level: options.moderation_level || 'permissive',
        output_format: options.output_format || 'png',
        return_base64: options.return_base64 !== false, // Return base64 for easier handling
      }
    };

    logger.info('Sending request to FASHN API...');

    // Make API call to start prediction
    const runResponse = await fashnClient.post('/run', requestData);

    if (!runResponse.data || !runResponse.data.id) {
      throw new Error('Invalid response from FASHN API: missing prediction ID');
    }

    const predictionId = runResponse.data.id;
    logger.info(`FASHN prediction started. ID: ${predictionId}`);

    // Poll for results
    const result = await pollPredictionStatus(predictionId, {
      maxWaitTime: options.maxWaitTime || 300000, // 5 minutes
      pollingInterval: options.pollingInterval || 5000, // 5 seconds
    });

    logger.info(`FASHN VTON process completed successfully. Prediction ID: ${predictionId}`);
    return result;

  } catch (error) {
    logger.error('FASHN virtual try-on process failed:', {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Create detailed error message
    let errorMessage = 'FASHN virtual try-on failed';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = `Invalid request: ${data?.error?.message || 'Bad request'}`;
          break;
        case 401:
          errorMessage = 'Authentication failed with FASHN API';
          break;
        case 403:
          errorMessage = 'Access denied to FASHN API';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded for FASHN API';
          break;
        case 500:
          errorMessage = 'FASHN API internal server error';
          break;
        case 503:
          errorMessage = 'FASHN API service unavailable';
          break;
        default:
          errorMessage = `FASHN API error (${status}): ${data?.error?.message || error.message}`;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - FASHN API took too long to respond';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to FASHN API';
    } else {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Poll prediction status until completion
 * @param {string} predictionId - Prediction ID to poll
 * @param {Object} options - Polling options
 * @returns {Promise<Object>} Result data
 */
async function pollPredictionStatus(predictionId, options = {}) {
  const {
    maxWaitTime = 300000, // 5 minutes maximum wait time
    pollingInterval = 5000, // Check every 5 seconds
  } = options;

  const startTime = Date.now();
  let attempts = 0;

  logger.info(`Starting to poll prediction ${predictionId}, max wait time: ${maxWaitTime}ms`);

  while (Date.now() - startTime < maxWaitTime) {
    attempts++;

    try {
      const statusResponse = await fashnClient.get(`/status/${predictionId}`);
      const statusData = statusResponse.data;

      logger.info(`Poll attempt ${attempts}: Prediction ${predictionId} status: ${statusData.status}`);

      // Check if prediction is complete
      if (statusData.status === 'completed') {
        logger.info(`Prediction ${predictionId} completed successfully after ${attempts} attempts`);
        return {
          success: true,
          predictionId: predictionId,
          status: 'completed',
          output: statusData.output,
          attempts: attempts,
          processingTime: Date.now() - startTime
        };

      } else if (statusData.status === 'failed') {
        const errorMsg = statusData.error?.message || 'Unknown error';
        throw new Error(`Prediction ${predictionId} failed: ${errorMsg}`);

      } else if (['starting', 'in_queue', 'processing'].includes(statusData.status)) {
        // Prediction is still processing, wait and try again
        logger.info(`Prediction ${predictionId} still ${statusData.status}, waiting ${pollingInterval}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingInterval));

      } else {
        // Unknown status, wait and try again
        logger.info(`Prediction ${predictionId} has unknown status: ${statusData.status}, waiting ${pollingInterval}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }

    } catch (error) {
      // Handle polling errors
      if (error.response && error.response.status === 404) {
        throw new Error(`Prediction ${predictionId} not found - it may have expired (results available for 5 minutes only)`);
      }

      // If we get other errors, try a few more times
      if (attempts >= 3) {
        logger.error(`Failed to check prediction ${predictionId} status after ${attempts} attempts:`, error);
        throw error;
      }

      logger.warn(`Error checking prediction ${predictionId} status (attempt ${attempts}), retrying...:`, error.message);
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
  }

  throw new Error(`Prediction ${predictionId} did not complete within ${maxWaitTime}ms after ${attempts} attempts`);
}

/**
 * Convert FASHN output to downloadable image
 * @param {Object} output - FASHN API output
 * @param {Object} options - Conversion options
 * @returns {Promise<Buffer>} Image buffer
 */
async function convertOutputToBuffer(output, options = {}) {
  try {
    if (!output || !output[0]) {
      throw new Error('No output image found in FASHN response');
    }

    const outputUrl = output[0];

    // If output is base64
    if (outputUrl.startsWith('data:image/')) {
      const base64Data = outputUrl.split(',')[1];
      const resultBuffer = Buffer.from(base64Data, 'base64');

      if (!resultBuffer || resultBuffer.length === 0) {
        throw new Error('Empty result image received from FASHN API');
      }

      logger.info(`FASHN result converted from base64. Size: ${resultBuffer.length} bytes`);
      return resultBuffer;
    }

    // If output is URL
    if (outputUrl.startsWith('http')) {
      const imageResponse = await axios.get(outputUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const resultBuffer = Buffer.from(imageResponse.data);

      if (!resultBuffer || resultBuffer.length === 0) {
        throw new Error('Empty result image received from FASHN API');
      }

      logger.info(`FASHN result downloaded from URL. Size: ${resultBuffer.length} bytes`);
      return resultBuffer;
    }

    throw new Error('Invalid output format from FASHN API');

  } catch (error) {
    logger.error('Failed to convert FASHN output to buffer:', error);
    throw new Error(`Failed to process FASHN output: ${error.message}`);
  }
}

/**
 * Get API usage statistics from FASHN (if available)
 * @returns {Promise<Object>} Usage statistics
 */
async function getApiUsage() {
  try {
    // FASHN doesn't have a public usage endpoint, but we can implement if needed
    logger.info('FASHN API usage endpoint not available');
    return { message: 'Usage statistics not available for FASHN API' };
  } catch (error) {
    logger.error('Failed to get FASHN API usage:', error);
    throw new Error(`Failed to get API usage: ${error.message}`);
  }
}

/**
 * Check FASHN API health status
 * @returns {Promise<Object>} Health status
 */
async function checkApiHealth() {
  try {
    // Try a minimal request to check API health
    const response = await fashnClient.get('/run', {
      timeout: 10000,
      validateStatus: (status) => status < 500 // Accept 4xx as API is up
    });

    return {
      healthy: true,
      status: response.status,
      message: 'FASHN API is accessible',
    };
  } catch (error) {
    logger.error('FASHN API health check failed:', error);
    return {
      healthy: false,
      error: error.message,
    };
  }
}

module.exports = {
  performVirtualTryOn,
  pollPredictionStatus,
  convertOutputToBuffer,
  getApiUsage,
  checkApiHealth,
  bufferToBase64,
};