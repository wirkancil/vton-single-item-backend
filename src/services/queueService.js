const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
const { logger } = require('./supabaseService');

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  lazyConnect: true,
  // Enable offline queue for reliability
  enableOfflineQueue: true,
  // Connection settings
  connectTimeout: 10000,
  commandTimeout: 5000,
};

// Create Redis connection
const redisConnection = new Redis(redisConfig);

// Handle Redis connection events
redisConnection.on('connect', () => {
  logger.info('Redis connected successfully');
});

redisConnection.on('error', (err) => {
  logger.error('Redis connection error:', err);
});

redisConnection.on('close', () => {
  logger.info('Redis connection closed');
});

// Create queue for try-on processing
const tryOnQueue = new Queue('try-on-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 50, // Keep last 50 completed jobs
    removeOnFail: 100, // Keep last 100 failed jobs
    attempts: 3, // Retry failed jobs up to 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    delay: 0, // No initial delay
    // Job priority (lower number = higher priority)
    priority: 1,
  },
});

// Create queue for cleanup tasks
const cleanupQueue = new Queue('cleanup-queue', {
  connection: redisConnection,
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 20,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
});

/**
 * Add try-on job to queue
 * @param {Object} jobData - Job data
 * @returns {Promise<Object>} Job info
 */
async function addTryOnJob(jobData) {
  try {
    logger.info(`Adding try-on job to queue: ${jobData.sessionId}`);

    const job = await tryOnQueue.add(
      'process-vton',
      jobData,
      {
        jobId: jobData.sessionId, // Use sessionId as job ID for idempotency
        priority: 1,
        // Add delay if needed for rate limiting
        delay: jobData.delay || 0,
      }
    );

    logger.info(`Try-on job added: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error adding try-on job:', error);
    throw new Error(`Failed to add try-on job: ${error.message}`);
  }
}

/**
 * Get job status and progress
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Job status
 */
async function getJobStatus(jobId) {
  try {
    const job = await tryOnQueue.getJob(jobId);

    if (!job) {
      return { status: 'not_found' };
    }

    const state = await job.getState();
    const progress = job.progress;

    return {
      id: job.id,
      status: state,
      progress,
      data: job.data,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      returnvalue: job.returnvalue,
    };
  } catch (error) {
    logger.error('Error getting job status:', error);
    throw new Error(`Failed to get job status: ${error.message}`);
  }
}

/**
 * Cancel a job
 * @param {string} jobId - Job ID
 * @returns {Promise<boolean>} Success status
 */
async function cancelJob(jobId) {
  try {
    const job = await tryOnQueue.getJob(jobId);

    if (!job) {
      return false;
    }

    // Try to remove the job
    const removed = await job.remove();

    if (removed) {
      logger.info(`Job ${jobId} cancelled successfully`);
      return true;
    }

    return false;
  } catch (error) {
    logger.error('Error cancelling job:', error);
    throw new Error(`Failed to cancel job: ${error.message}`);
  }
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue stats
 */
async function getQueueStats() {
  try {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      tryOnQueue.getWaiting(),
      tryOnQueue.getActive(),
      tryOnQueue.getCompleted(),
      tryOnQueue.getFailed(),
      tryOnQueue.getDelayed(),
    ]);

    return {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      total: waiting.length + active.length + completed.length + failed.length + delayed.length,
    };
  } catch (error) {
    logger.error('Error getting queue stats:', error);
    throw new Error(`Failed to get queue stats: ${error.message}`);
  }
}

/**
 * Add cleanup job to queue
 * @param {Object} jobData - Cleanup job data
 * @returns {Promise<Object>} Job info
 */
async function addCleanupJob(jobData) {
  try {
    logger.info(`Adding cleanup job: ${jobData.type}`);

    const job = await cleanupQueue.add(
      'cleanup-resources',
      jobData,
      {
        delay: jobData.delay || 0,
      }
    );

    logger.info(`Cleanup job added: ${job.id}`);
    return job;
  } catch (error) {
    logger.error('Error adding cleanup job:', error);
    throw new Error(`Failed to add cleanup job: ${error.message}`);
  }
}

/**
 * Graceful shutdown function
 */
async function shutdown() {
  try {
    logger.info('Shutting down queues...');

    // Close queues
    await tryOnQueue.close();
    await cleanupQueue.close();

    // Close Redis connection
    await redisConnection.quit();

    logger.info('Queues shutdown complete');
  } catch (error) {
    logger.error('Error during queue shutdown:', error);
    throw error;
  }
}

// Handle process termination gracefully
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down queues...');
  await shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down queues...');
  await shutdown();
  process.exit(0);
});

module.exports = {
  tryOnQueue,
  cleanupQueue,
  redisConnection,
  addTryOnJob,
  getJobStatus,
  cancelJob,
  getQueueStats,
  addCleanupJob,
  shutdown,
};