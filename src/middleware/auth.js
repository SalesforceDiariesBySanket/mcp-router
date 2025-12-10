import { logger } from '../utils/logger.js';

/**
 * Authentication middleware for API requests
 * Supports API Key authentication via X-API-Key header or Authorization Bearer token
 */
export function authMiddleware(req, res, next) {
  const apiKey = process.env.API_KEY;
  
  // If no API key is configured, skip authentication (development mode)
  if (!apiKey) {
    logger.warn('No API_KEY configured - running in development mode without authentication');
    return next();
  }

  // Check X-API-Key header
  const providedApiKey = req.headers['x-api-key'];
  
  // Check Authorization header (Bearer token)
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader?.startsWith('Bearer ') 
    ? authHeader.substring(7) 
    : null;

  // Validate API key
  if (providedApiKey === apiKey || bearerToken === apiKey) {
    return next();
  }

  logger.warn('Unauthorized request attempt', {
    ip: req.ip,
    path: req.path,
  });

  return res.status(401).json({
    error: 'Unauthorized',
    message: 'Invalid or missing API key. Provide X-API-Key header or Authorization Bearer token.',
  });
}
