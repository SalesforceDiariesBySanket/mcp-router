import { logger } from '../utils/logger.js';

/**
 * Global error handling middleware
 */
export function errorHandler(err, req, res, next) {
  logger.error('Unhandled error:', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details || null,
    });
  }

  if (err.name === 'MCPError') {
    return res.status(502).json({
      error: 'MCP Server Error',
      message: err.message,
      code: err.code || null,
    });
  }

  if (err.name === 'ConnectionError') {
    return res.status(503).json({
      error: 'Connection Error',
      message: 'Failed to connect to MCP server',
      details: err.message,
    });
  }

  // Default error response
  return res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message,
  });
}
