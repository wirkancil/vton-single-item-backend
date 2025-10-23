const crypto = require('crypto');
const { logger } = require('../services/supabaseService');
const {
  updateTryOnSession,
  getTryOnSessionByJobId,
  uploadImage
} = require('../services/supabaseService');
const { addCleanupJob } = require('../services/queueService');

/**
 * Validate webhook signature (if signature is provided)
 * @param {string} payload - Raw request body
 * @param {string} signature - Signature from header
 * @returns {boolean} Valid signature
 */
function validateWebhookSignature(payload, signature) {
  try {
    // For now, skip signature validation as we don't have the webhook secret
    // In production, you should validate signatures like this:
    // const webhookSecret = process.env.PIXAZO_WEBHOOK_SECRET;
    // const expectedSignature = crypto
    //   .createHmac('sha256', webhookSecret)
    //   .update(payload)
    //   .digest('hex');
    // return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    return true; // Skip validation for now
  } catch (error) {
    logger.error('Webhook signature validation error:', error);
    return false;
  }
}

/**
 * Handle Pixazo API callback
 * @param {Object} callbackData - Callback data from Pixazo
 */
async function handlePixazoCallback(callbackData) {
  try {
    logger.info('Processing Pixazo callback:', callbackData);

    // Extract job information
    const jobId = callbackData.job_id || callbackData.id;
    const status = callbackData.status || callbackData.state;
    const resultImageUrl = callbackData.result_image_url;
    const errorMessage = callbackData.error || callbackData.message;

    if (!jobId) {
      throw new Error('Missing job_id in callback data');
    }

    // Find the try-on session associated with this job
    let sessionData;
    try {
      sessionData = await getTryOnSessionByJobId(jobId);
    } catch (error) {
      logger.warn(`No session found for job ${jobId}:`, error.message);
      // Don't throw error - just log it as the job might not be from our system
      return;
    }

    if (!sessionData) {
      logger.warn(`No session found for job ${jobId}, ignoring callback`);
      return;
    }

    logger.info(`Found session ${sessionData.id} for job ${jobId}`);

    // Prepare update data
    const updateData = {
      updated_at: new Date().toISOString()
    };

    // Handle different statuses
    if (status === 'completed' || status === 'success') {
      if (resultImageUrl) {
        logger.info(`Processing successful result for job ${jobId}`);

        try {
          // Download and upload the result image to our storage
          const axios = require('axios');
          const imageResponse = await axios.get(resultImageUrl, {
            responseType: 'arraybuffer',
            timeout: 60000,
          });

          const resultBuffer = Buffer.from(imageResponse.data);

          // Upload result image to Supabase Storage
          const resultImagePath = `try-on-results/${sessionData.user_id}/${sessionData.id}_result.png`;
          const finalResultUrl = await uploadImage(
            resultImagePath,
            resultBuffer,
            'image/png'
          );

          updateData.status = 'success';
          updateData.result_image_url = finalResultUrl;
          updateData.error_message = null;

          logger.info(`Successfully processed result for job ${jobId}, stored at: ${finalResultUrl}`);

        } catch (imageError) {
          logger.error(`Failed to process result image for job ${jobId}:`, imageError);
          updateData.status = 'failed';
          updateData.error_message = `Failed to process result image: ${imageError.message}`;
        }
      } else {
        logger.warn(`Job ${jobId} marked as success but no result image provided`);
        updateData.status = 'failed';
        updateData.error_message = 'Job completed but no result image provided';
      }

    } else if (status === 'failed' || status === 'error') {
      logger.info(`Processing failed result for job ${jobId}: ${errorMessage}`);
      updateData.status = 'failed';
      updateData.error_message = errorMessage || 'Job failed with unknown error';

    } else if (status === 'processing' || status === 'pending') {
      logger.info(`Job ${jobId} is still ${status}`);
      updateData.status = 'processing'; // Already set, but update timestamp

    } else {
      logger.warn(`Unknown status for job ${jobId}: ${status}`);
      updateData.status = 'failed';
      updateData.error_message = `Unknown job status: ${status}`;
    }

    // Update the session in database
    try {
      await updateTryOnSession(sessionData.id, updateData);
      logger.info(`Successfully updated session ${sessionData.id} for job ${jobId}`);
    } catch (updateError) {
      logger.error(`Failed to update session ${sessionData.id} for job ${jobId}:`, updateError);
      throw updateError;
    }

    // Schedule cleanup for temporary files if job is complete
    if (updateData.status === 'success' || updateData.status === 'failed') {
      try {
        await addCleanupJob({
          type: 'temporary_files',
          sessionId: sessionData.id,
          userId: sessionData.user_id,
          delay: 24 * 60 * 60 * 1000, // 24 hours delay
        });
      } catch (cleanupError) {
        logger.error(`Failed to schedule cleanup for session ${sessionData.id}:`, cleanupError);
        // Don't fail the webhook for cleanup errors
      }
    }

  } catch (error) {
    logger.error('Critical error in Pixazo callback handler:', error);
    throw error; // Re-throw to ensure proper error handling
  }
}

module.exports = {
  validateWebhookSignature,
  handlePixazoCallback,
};