const axios = require('axios');
const { logger } = require('./supabaseService');

// Pixazo API configuration - Updated to use the correct endpoint
const PIXAZO_API_URL = process.env.PIXAZO_API_URL || 'https://gateway.pixazo.ai/virtual-tryon/v1/r-vton';
const PIXAZO_API_KEY = process.env.PIXAZO_API_KEY;

if (!PIXAZO_API_KEY) {
  logger.warn('PIXAZO_API_KEY not configured. Pixazo service will not work.');
}

// Create Axios instance with default configuration
const pixazoClient = axios.create({
  baseURL: PIXAZO_API_URL,
  timeout: 300000, // 5 minutes timeout for AI processing
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Request interceptor to add API key
pixazoClient.interceptors.request.use(
  (config) => {
    if (PIXAZO_API_KEY) {
      config.headers['Ocp-Apim-Subscription-Key'] = PIXAZO_API_KEY;
    }
    logger.info(`Making Pixazo API request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    logger.error('Pixazo request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for logging and error handling
pixazoClient.interceptors.response.use(
  (response) => {
    logger.info(`Pixazo API response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    const status = error.response?.status;
    const url = error.config?.url;
    logger.error(`Pixazo API error: ${status} ${url}`, {
      message: error.message,
      data: error.response?.data,
    });
    return Promise.reject(error);
  }
);

/**
 * Validate image URL
 * @param {string} imageUrl - Image URL to validate
 * @returns {Promise<boolean>} Is URL valid
 */
async function validateImageUrl(imageUrl) {
  try {
    const response = await axios.head(imageUrl, { timeout: 10000 });
    const contentType = response.headers['content-type'];
    return contentType && contentType.startsWith('image/');
  } catch (error) {
    logger.warn(`Invalid image URL: ${imageUrl}`, { error: error.message });
    return false;
  }
}

/**
 * Prepare input data for Pixazo API
 * @param {string} userImageUrl - User image URL
 * @param {string} garmentImageUrl - Garment image URL
 * @param {string} callbackUrl - Optional callback URL
 * @returns {Object} Prepared data for API
 */
function prepareInputData(userImageUrl, garmentImageUrl, callbackUrl = "") {
  return {
    category: "upper_body", // Default category, could be made configurable
    human_img: userImageUrl,
    garm_img: garmentImageUrl,
    callback_url: callbackUrl, // Optional: can be configured for callbacks
  };
}

/**
 * Generate callback URL for Pixazo API
 * @param {string} sessionId - Session ID (optional, for tracking)
 * @returns {string} Callback URL
 */
function generateCallbackUrl(sessionId = null) {
  const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  const callbackUrl = `${baseUrl}/api/webhooks/pixazo`;

  // Add session ID as query parameter for tracking (optional)
  if (sessionId) {
    return `${callbackUrl}?session_id=${sessionId}`;
  }

  return callbackUrl;
}

/**
 * Perform virtual try-on using Pixazo Kolors API
 * @param {string} userImageUrl - URL of user image
 * @param {string} garmentImageUrl - URL of garment image
 * @param {Object} options - Additional options
 * @returns {Promise<Buffer>} Result image buffer
 */
async function performVirtualTryOn(userImageUrl, garmentImageUrl, options = {}) {
  try {
    if (!PIXAZO_API_KEY) {
      throw new Error('Pixazo API key not configured');
    }

    logger.info(`Starting VTON process for user: ${userImageUrl}, garment: ${garmentImageUrl}`);

    // Skip URL validation for testing with external images
    // In production, you might want to validate URLs, but for testing with external APIs
    // we'll skip this step as some valid images might return 403 due to CORS/restrictions
    logger.info('Skipping URL validation for external test images');

    // Generate callback URL for this session
    const callbackUrl = options.sessionId ? generateCallbackUrl(options.sessionId) : generateCallbackUrl();

    // Prepare request data
    const requestData = prepareInputData(userImageUrl, garmentImageUrl, callbackUrl);

    logger.info('Sending request to Pixazo API...');

    // Make API call (using POST directly to the base URL as it's the full endpoint)
    const response = await pixazoClient.post('', requestData);

    if (!response.data) {
      throw new Error('No response data from Pixazo API');
    }

    // Handle asynchronous response - the API returns a job ID
    if (response.data.id) {
      // This is an async API that returns a job ID
      const jobId = response.data.id;
      logger.info(`Pixazo job submitted successfully. Job ID: ${jobId}`);

      // Implement real polling for Pixazo API result
      const result = await pollPixazoResult(jobId);
      return result;

    } else if (response.data.result_image_url) {
      // If API returns image URL directly
      const resultImageUrl = response.data.result_image_url;

      // Download the result image
      const imageResponse = await axios.get(resultImageUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      const resultBuffer = Buffer.from(imageResponse.data);

      // Validate result buffer
      if (!resultBuffer || resultBuffer.length === 0) {
        throw new Error('Empty result image received from Pixazo API');
      }

      logger.info(`VTON process completed successfully. Result size: ${resultBuffer.length} bytes`);
      return resultBuffer;

    } else if (response.data.result_image_base64) {
      // If API returns base64 encoded image
      const base64Data = response.data.result_image_base64;
      const resultBuffer = Buffer.from(base64Data, 'base64');

      // Validate result buffer
      if (!resultBuffer || resultBuffer.length === 0) {
        throw new Error('Empty result image received from Pixazo API');
      }

      logger.info(`VTON process completed successfully. Result size: ${resultBuffer.length} bytes`);
      return resultBuffer;

    } else if (Buffer.isBuffer(response.data)) {
      // If API returns raw image buffer
      const resultBuffer = response.data;

      // Validate result buffer
      if (!resultBuffer || resultBuffer.length === 0) {
        throw new Error('Empty result image received from Pixazo API');
      }

      logger.info(`VTON process completed successfully. Result size: ${resultBuffer.length} bytes`);
      return resultBuffer;

    } else {
      throw new Error('Unexpected response format from Pixazo API');
    }

  } catch (error) {
    logger.error('Virtual try-on process failed:', {
      userImageUrl,
      garmentImageUrl,
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Create detailed error message
    let errorMessage = 'Virtual try-on failed';

    if (error.response) {
      // API returned error response
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 400:
          errorMessage = `Invalid request: ${data?.message || 'Bad request'}`;
          break;
        case 401:
          errorMessage = 'Authentication failed with Pixazo API';
          break;
        case 403:
          errorMessage = 'Access denied to Pixazo API';
          break;
        case 429:
          errorMessage = 'Rate limit exceeded for Pixazo API';
          break;
        case 500:
          errorMessage = 'Pixazo API internal server error';
          break;
        case 503:
          errorMessage = 'Pixazo API service unavailable';
          break;
        default:
          errorMessage = `Pixazo API error (${status}): ${data?.message || error.message}`;
      }
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout - Pixazo API took too long to respond';
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorMessage = 'Unable to connect to Pixazo API';
    } else {
      errorMessage = error.message;
    }

    throw new Error(errorMessage);
  }
}

/**
 * Poll Pixazo API for job result
 * @param {string} jobId - The job ID from Pixazo API
 * @param {number} maxWaitTime - Maximum wait time in milliseconds (default: 5 minutes)
 * @param {number} pollInterval - Polling interval in milliseconds (default: 10 seconds)
 * @returns {Promise<Buffer>} Result image buffer
 */
async function pollPixazoResult(jobId, maxWaitTime = 300000, pollInterval = 10000) {
  try {
    logger.info(`Starting to poll Pixazo job ${jobId} for result...`);

    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Check job status
        const statusResponse = await pixazoClient.get(`/${jobId}`);

        if (!statusResponse.data) {
          throw new Error('No status data received from Pixazo API');
        }

        const statusData = statusResponse.data;
        logger.info(`Pixazo job ${jobId} status:`, {
          status: statusData.status,
          progress: statusData.progress || 'N/A'
        });

        // Check if job is completed
        if (statusData.status === 'completed' || statusData.status === 'success') {
          logger.info(`Pixazo job ${jobId} completed successfully!`);

          // Handle different response formats
          if (statusData.output_img_url || statusData.result_image_url) {
            const resultImageUrl = statusData.output_img_url || statusData.result_image_url;

            logger.info(`Downloading result from: ${resultImageUrl}`);

            // Download the result image
            const imageResponse = await axios.get(resultImageUrl, {
              responseType: 'arraybuffer',
              timeout: 60000,
              headers: {
                'User-Agent': 'VTON-Backend/1.0'
              }
            });

            const resultBuffer = Buffer.from(imageResponse.data);
            logger.info(`Successfully downloaded result image (${resultBuffer.length} bytes)`);

            return resultBuffer;

          } else if (statusData.result_image_base64) {
            // Handle base64 result
            const base64Data = statusData.result_image_base64;
            const resultBuffer = Buffer.from(base64Data, 'base64');

            logger.info(`Successfully decoded result image (${resultBuffer.length} bytes)`);
            return resultBuffer;

          } else {
            throw new Error('Job completed but no result image found in response');
          }

        } else if (statusData.status === 'failed' || statusData.status === 'error') {
          const errorMessage = statusData.error || statusData.message || 'Unknown error';
          throw new Error(`Pixazo job ${jobId} failed: ${errorMessage}`);
        }

        // Job is still processing, wait before next poll
        logger.info(`Job ${jobId} still processing... waiting ${pollInterval/1000}s`);
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        if (error.response?.status === 404) {
          logger.warn(`Job ${jobId} not found yet, will retry...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }

        logger.error(`Error polling job ${jobId}:`, {
          message: error.message,
          status: error.response?.status,
          data: error.response?.data
        });

        // Continue polling for non-critical errors
        if (error.response?.status >= 500 || error.code === 'ECONNABORTED') {
          logger.info(`Retrying job ${jobId} after error...`);
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }

        throw error;
      }
    }

    throw new Error(`Timeout waiting for Pixazo job ${jobId} to complete after ${maxWaitTime/1000} seconds`);

  } catch (error) {
    logger.error(`Failed to poll Pixazo job ${jobId}:`, {
      message: error.message,
      stack: error.stack
    });
    throw error;
  }
}

/**
 * Get API usage statistics from Pixazo
 * @returns {Promise<Object>} Usage statistics
 */
async function getApiUsage() {
  try {
    const response = await pixazoClient.get('/usage');
    return response.data;
  } catch (error) {
    logger.error('Failed to get API usage:', error);
    throw new Error(`Failed to get API usage: ${error.message}`);
  }
}

/**
 * Check Pixazo API health status
 * @returns {Promise<Object>} Health status
 */
async function checkApiHealth() {
  try {
    const response = await pixazoClient.get('/health', { timeout: 10000 });
    return {
      healthy: true,
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    logger.error('Pixazo API health check failed:', error);
    return {
      healthy: false,
      error: error.message,
    };
  }
}

/**
 * Get supported image formats from Pixazo API
 * @returns {Promise<Array>} Supported formats
 */
async function getSupportedFormats() {
  try {
    const response = await pixazoClient.get('/formats');
    return response.data.formats || [];
  } catch (error) {
    logger.error('Failed to get supported formats:', error);
    // Return common formats as fallback
    return ['image/jpeg', 'image/png', 'image/webp'];
  }
}

/**
 * Check job status from Pixazo API
 * @param {string} jobId - Job ID to check
 * @returns {Promise<Object>} Job status information
 */
async function checkJobStatus(jobId) {
  try {
    if (!PIXAZO_API_KEY) {
      throw new Error('Pixazo API key not configured');
    }

    logger.info(`Checking job status for job ID: ${jobId}`);

    const response = await pixazoClient.get(`/status/${jobId}`);

    if (!response.data) {
      throw new Error('No response data from Pixazo API');
    }

    logger.info(`Job status for ${jobId}:`, response.data);
    return response.data;

  } catch (error) {
    logger.error(`Failed to check job status for ${jobId}:`, {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    // Create detailed error message
    let errorMessage = 'Failed to check job status';

    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
        case 404:
          errorMessage = 'Job not found';
          break;
        case 401:
          errorMessage = 'Authentication failed';
          break;
        default:
          errorMessage = `API error (${status}): ${data?.message || error.message}`;
      }
    }

    throw new Error(errorMessage);
  }
}

/**
 * Get job result from Pixazo API
 * @param {string} jobId - Job ID to get result for
 * @returns {Promise<Buffer>} Result image buffer
 */
async function getJobResult(jobId) {
  try {
    if (!PIXAZO_API_KEY) {
      throw new Error('Pixazo API key not configured');
    }

    logger.info(`Getting job result for job ID: ${jobId}`);

    const response = await pixazoClient.get(`/result/${jobId}`);

    if (!response.data) {
      throw new Error('No response data from Pixazo API');
    }

    // Handle different response formats
    let resultBuffer;

    if (response.data.result_image_url) {
      // If API returns image URL
      const resultImageUrl = response.data.result_image_url;

      // Download the result image
      const imageResponse = await axios.get(resultImageUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      resultBuffer = Buffer.from(imageResponse.data);

    } else if (response.data.result_image_base64) {
      // If API returns base64 encoded image
      const base64Data = response.data.result_image_base64;
      resultBuffer = Buffer.from(base64Data, 'base64');

    } else if (Buffer.isBuffer(response.data)) {
      // If API returns raw image buffer
      resultBuffer = response.data;

    } else {
      throw new Error('Unexpected response format from Pixazo API');
    }

    // Validate result buffer
    if (!resultBuffer || resultBuffer.length === 0) {
      throw new Error('Empty result image received from Pixazo API');
    }

    logger.info(`Job result retrieved successfully. Job ID: ${jobId}, Size: ${resultBuffer.length} bytes`);

    return resultBuffer;

  } catch (error) {
    logger.error(`Failed to get job result for ${jobId}:`, {
      error: error.message,
      status: error.response?.status,
      data: error.response?.data,
    });

    throw new Error(`Failed to get job result: ${error.message}`);
  }
}

/**
 * Poll job status until completion
 * @param {string} jobId - Job ID to poll
 * @param {Object} options - Polling options
 * @returns {Promise<Buffer>} Result image buffer
 */
async function pollJobUntilComplete(jobId, options = {}) {
  const {
    maxWaitTime = 300000, // 5 minutes maximum wait time
    pollingInterval = 10000, // Check every 10 seconds
    timeoutIncrement = 5000, // Increment timeout for each attempt
  } = options;

  const startTime = Date.now();
  let attempts = 0;
  let currentTimeout = 10000; // Start with 10 second timeout

  logger.info(`Starting to poll job ${jobId}, max wait time: ${maxWaitTime}ms`);

  while (Date.now() - startTime < maxWaitTime) {
    attempts++;

    try {
      // Update timeout for each attempt
      pixazoClient.defaults.timeout = currentTimeout + timeoutIncrement;

      const status = await checkJobStatus(jobId);

      logger.info(`Poll attempt ${attempts}: Job ${jobId} status: ${JSON.stringify(status)}`);

      // Check if job is complete
      if (status.status === 'completed' || status.state === 'completed' || status.status === 'success') {
        logger.info(`Job ${jobId} completed successfully after ${attempts} attempts`);

        // Get the result
        return await getJobResult(jobId);

      } else if (status.status === 'failed' || status.state === 'failed' || status.status === 'error') {
        throw new Error(`Job ${jobId} failed: ${status.error || status.message || 'Unknown error'}`);

      } else if (status.status === 'processing' || status.state === 'processing' || status.status === 'pending') {
        // Job is still processing, wait and try again
        logger.info(`Job ${jobId} still processing, waiting ${pollingInterval}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingInterval));

      } else {
        // Unknown status, wait and try again
        logger.info(`Job ${jobId} has unknown status: ${status.status}, waiting ${pollingInterval}ms...`);
        await new Promise(resolve => setTimeout(resolve, pollingInterval));
      }

    } catch (error) {
      // If we get an error checking status, try a few more times
      if (attempts >= 3) {
        logger.error(`Failed to check job ${jobId} status after ${attempts} attempts:`, error);
        throw error;
      }

      logger.warn(`Error checking job ${jobId} status (attempt ${attempts}), retrying...:`, error.message);
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
  }

  throw new Error(`Job ${jobId} did not complete within ${maxWaitTime}ms after ${attempts} attempts`);
}

/**
 * Estimate processing time based on image characteristics
 * @param {string} userImageUrl - User image URL
 * @param {string} garmentImageUrl - Garment image URL
 * @returns {Promise<number>} Estimated time in seconds
 */
async function estimateProcessingTime(userImageUrl, garmentImageUrl) {
  try {
    // Basic estimation based on API response patterns
    // In a real implementation, this could use image size, complexity, etc.
    const baseTime = 30; // 30 seconds base time

    // Add random variation to simulate different processing times
    const variation = Math.random() * 20 - 10; // ±10 seconds

    return Math.max(15, baseTime + variation); // Minimum 15 seconds
  } catch (error) {
    logger.error('Failed to estimate processing time:', error);
    return 45; // Default fallback estimate
  }
}

module.exports = {
  performVirtualTryOn,
  pollPixazoResult,  // Added new polling function
  getApiUsage,
  checkApiHealth,
  getSupportedFormats,
  estimateProcessingTime,
  validateImageUrl,
  checkJobStatus,
  getJobResult,
  pollJobUntilComplete,
  generateCallbackUrl,
};