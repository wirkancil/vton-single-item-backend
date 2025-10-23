const jwt = require('jsonwebtoken');
const { logger } = require('../services/supabaseService');

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_ALGORITHM = process.env.JWT_ALGORITHM || 'HS256';

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

/**
 * Verify and decode JWT token from Supabase
 * @param {string} token - JWT token
 * @returns {Promise<Object>} Decoded token payload
 */
async function verifyToken(token) {
  try {
    // Verify token using Supabase JWT secret
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: [JWT_ALGORITHM],
      // Allow for slight clock skew
      clockTolerance: 30,
    });

    // Check if token is expired
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token has expired');
    }

    // Validate required claims
    if (!decoded.sub || !decoded.aud) {
      throw new Error('Invalid token: missing required claims');
    }

    return decoded;
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token');
    } else if (error.name === 'TokenExpiredError') {
      throw new Error('Token has expired');
    } else if (error.name === 'NotBeforeError') {
      throw new Error('Token not active');
    } else {
      throw error;
    }
  }
}

/**
 * Express middleware for authentication
 * Verifies JWT token from Authorization header and attaches user info to request
 */
async function authenticateToken(req, res, next) {
  try {
    // Get Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Authorization header required',
        code: 'MISSING_AUTH_HEADER'
      });
    }

    // Extract token from "Bearer <token>" format
    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid authorization header format. Expected: "Bearer <token>"',
        code: 'INVALID_AUTH_FORMAT'
      });
    }

    const token = tokenMatch[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token required',
        code: 'MISSING_TOKEN'
      });
    }

    // Verify token
    const decoded = await verifyToken(token);

    // Attach user information to request object
    req.user = {
      id: decoded.sub, // User ID from Supabase auth
      email: decoded.email,
      role: decoded.role || 'authenticated',
      aud: decoded.aud,
      exp: decoded.exp,
      iat: decoded.iat,
      // Additional claims if available
      app_metadata: decoded.app_metadata,
      user_metadata: decoded.user_metadata,
    };

    // Log authentication (without sensitive data)
    logger.info(`User authenticated: ${req.user.id}`);

    next();
  } catch (error) {
    logger.error('Authentication error:', error);

    let statusCode = 401;
    let errorCode = 'AUTH_ERROR';
    let message = 'Authentication failed';

    if (error.message.includes('expired')) {
      message = 'Token has expired';
      errorCode = 'TOKEN_EXPIRED';
    } else if (error.message.includes('Invalid token')) {
      message = 'Invalid token';
      errorCode = 'INVALID_TOKEN';
    } else if (error.message.includes('not active')) {
      message = 'Token not active';
      errorCode = 'TOKEN_NOT_ACTIVE';
    }

    return res.status(statusCode).json({
      success: false,
      message,
      code: errorCode,
      // Include error details in development
      ...(process.env.NODE_ENV === 'development' && { error: error.message })
    });
  }
}

/**
 * Middleware to check if user has specific role
 * @param {string|Array<string>} requiredRoles - Required role(s)
 * @returns {Function} Express middleware function
 */
function requireRole(requiredRoles) {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const userRole = req.user.role;
    const hasRequiredRole = roles.includes(userRole) || roles.includes('*');

    if (!hasRequiredRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${roles.join(', ')}`,
        code: 'INSUFFICIENT_PERMISSIONS',
        currentRole: userRole,
        requiredRoles: roles
      });
    }

    next();
  };
}

/**
 * Middleware to optionally authenticate (doesn't fail if no token)
 * Attaches user info if token is valid, otherwise continues with req.user = null
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      req.user = null;
      return next();
    }

    const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/);
    if (!tokenMatch) {
      req.user = null;
      return next();
    }

    const token = tokenMatch[1];
    if (!token) {
      req.user = null;
      return next();
    }

    // Try to verify token
    const decoded = await verifyToken(token);

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role || 'authenticated',
      aud: decoded.aud,
      exp: decoded.exp,
      iat: decoded.iat,
      app_metadata: decoded.app_metadata,
      user_metadata: decoded.user_metadata,
    };

    logger.info(`User authenticated (optional): ${req.user.id}`);
  } catch (error) {
    // Log but don't fail - this is optional auth
    logger.debug('Optional authentication failed:', error.message);
    req.user = null;
  }

  next();
}

/**
 * Middleware to validate user ownership of resource
 * @param {string} userIdField - Field name containing user ID in resource
 * @returns {Function} Express middleware function
 */
function requireOwnership(userIdField = 'user_id') {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // This middleware should be used after fetching the resource
    // and attaching it to req.resource
    if (!req.resource) {
      return res.status(500).json({
        success: false,
        message: 'Resource not loaded',
        code: 'RESOURCE_NOT_LOADED'
      });
    }

    const resourceUserId = req.resource[userIdField];
    const currentUserId = req.user.id;

    if (resourceUserId !== currentUserId) {
      logger.warn(`Access denied: User ${currentUserId} trying to access resource owned by ${resourceUserId}`);

      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not own this resource',
        code: 'ACCESS_DENIED',
        resourceOwnerId: resourceUserId,
        currentUserId
      });
    }

    next();
  };
}

/**
 * Middleware to extract session ID from request parameters
 * and validate UUID format
 */
function validateSessionId(req, res, next) {
  const { sessionId } = req.params;

  if (!sessionId) {
    return res.status(400).json({
      success: false,
      message: 'Session ID is required',
      code: 'MISSING_SESSION_ID'
    });
  }

  // Basic UUID format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(sessionId)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid session ID format',
      code: 'INVALID_SESSION_ID'
    });
  }

  req.sessionId = sessionId;
  next();
}

module.exports = {
  authenticateToken,
  requireRole,
  optionalAuth,
  requireOwnership,
  validateSessionId,
  verifyToken,
};