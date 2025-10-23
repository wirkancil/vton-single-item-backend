const { Worker } = require('bullmq');
const { logger } = require('../services/supabaseService');
const { performVirtualTryOn, checkApiHealth } = require('../services/pixazoService');
const { uploadImage, updateTryOnSession, getGarmentById, linkJobToSession } = require('../services/supabaseService');
const { redisConnection } = require('../services/queueService');

// Worker configuration
const workerConfig = {
  connection: redisConnection,
  concurrency: 3, // Process up to 3 jobs concurrently
  // Remove completed jobs after 24 hours
  removeOnComplete: 100,
  // Remove failed jobs after 7 days
  removeOnFail: 50,
};

// Create worker for try-on processing
const tryOnWorker = new Worker(
  'try-on-queue',
  async (job) => {
    const { sessionId, userId, garmentId, originalUserImageUrl, garmentImageUrl } = job.data;

    logger.info(`Starting VTON processing for session: ${sessionId}`);

    try {
      // Update session status to 'processing'
      await updateTryOnSession(sessionId, {
        status: 'processing',
        error_message: null
      });

      // Update job progress
      job.updateProgress(10);

      // Verify garment still exists
      let garment;
      try {
        garment = await getGarmentById(garmentId);
      } catch (error) {
        throw new Error(`Garment not found: ${error.message}`);
      }

      // Use garment image URL from database if not provided
      const finalGarmentImageUrl = garmentImageUrl || garment.image_url;

      job.updateProgress(20);

      // Check Pixazo API health before processing
      const apiHealth = await checkApiHealth();
      if (!apiHealth.healthy) {
        throw new Error(`Pixazo API is unhealthy: ${apiHealth.error}`);
      }

      job.updateProgress(30);

      logger.info(`Calling Pixazo API for session: ${sessionId}`);

      // Perform virtual try-on with callback support
      try {
        const resultImageBuffer = await performVirtualTryOn(
          originalUserImageUrl,
          finalGarmentImageUrl,
          {
            sessionId: sessionId,
            quality: 'high',
            resolution: '1024x1024'
          }
        );

        // If we get here, it means the API returned results directly (synchronous)
        job.updateProgress(80);

        // Upload result image to Supabase Storage
        const resultImagePath = `try-on-results/${userId}/${sessionId}_result.png`;
        const resultImageUrl = await uploadImage(
          resultImagePath,
          resultImageBuffer,
          'image/png'
        );

        job.updateProgress(90);

        // Update session with success status and result URL
        await updateTryOnSession(sessionId, {
          status: 'success',
          result_image_url: resultImageUrl,
          error_message: null
        });

        job.updateProgress(100);

        logger.info(`VTON processing completed successfully for session: ${sessionId}`);

        return {
          success: true,
          sessionId,
          resultImageUrl,
          processingTime: Date.now() - job.timestamp
        };

      } catch (apiError) {
        // Check if this is a callback-based processing error
        if (apiError.code === 'CALLBACK_PROCESSING') {
          logger.info(`Callback-based processing started for session: ${sessionId}, Job ID: ${apiError.jobId}`);

          // Link job to session for callback tracking
          await linkJobToSession(sessionId, apiError.jobId, {
            user_id: userId,
            garment_id: garmentId,
            callback_url: apiError.callbackUrl,
            status: 'processing'
          });

          // Update session status to indicate callback processing
          await updateTryOnSession(sessionId, {
            status: 'processing',
            error_message: `Processing via callback. Job ID: ${apiError.jobId}`
          });

          job.updateProgress(50); // 50% - job submitted, waiting for callback

          // For callback-based processing, we don't complete the job immediately
          // The job will be completed when the webhook callback is received
          return {
            success: true,
            sessionId,
            jobId: apiError.jobId,
            callbackUrl: apiError.callbackUrl,
            processingType: 'callback',
            processingTime: Date.now() - job.timestamp
          };

        } else {
          // Re-throw other API errors
          throw apiError;
        }
      }

    } catch (error) {
      logger.error(`VTON processing failed for session: ${sessionId}`, {
        error: error.message,
        stack: error.stack
      });

      // Update session with failed status
      try {
        await updateTryOnSession(sessionId, {
          status: 'failed',
          error_message: error.message
        });
      } catch (updateError) {
        logger.error(`Failed to update session status for failed session: ${sessionId}`, {
          error: updateError.message
        });
      }

      // Re-throw the error to mark job as failed
      throw error;
    }
  },
  workerConfig
);

// Worker event handlers
tryOnWorker.on('completed', (job) => {
  logger.info(`Job completed: ${job.id}`, {
    sessionId: job.data.sessionId,
    processingTime: Date.now() - job.timestamp,
    returnValue: job.returnvalue
  });
});

tryOnWorker.on('failed', (job, err) => {
  logger.error(`Job failed: ${job.id}`, {
    sessionId: job.data?.sessionId,
    error: err.message,
    stack: err.stack,
    attemptsMade: job.attemptsMade,
    opts: job.opts
  });
});

tryOnWorker.on('error', (err) => {
  logger.error('Worker error:', err);
});

tryOnWorker.on('active', (job) => {
  logger.info(`Job started: ${job.id}`, {
    sessionId: job.data.sessionId
  });
});

tryOnWorker.on('progress', (job, progress) => {
  logger.debug(`Job progress: ${job.id} - ${progress}%`, {
    sessionId: job.data.sessionId
  });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received, shutting down worker gracefully...`);

  try {
    // Stop accepting new jobs
    await tryOnWorker.close();
    logger.info('Worker closed successfully');
  } catch (error) {
    logger.error('Error during worker shutdown:', error);
  }

  process.exit(0);
};

// Handle process termination
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  gracefulShutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});

logger.info('VTON Worker started and listening for jobs...');

// Export for testing
module.exports = { tryOnWorker };