import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { mcpRouter } from './routes/mcp.js';
import { healthRouter } from './routes/health.js';
import { serversRouter } from './routes/servers.js';
import { MCPConnectionManager } from './services/MCPConnectionManager.js';

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
}));

// CORS configuration
const corsOrigins = process.env.CORS_ORIGINS || '*';
app.use(cors({
  origin: corsOrigins === '*' ? '*' : corsOrigins.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
  });
  next();
});

// Initialize MCP Connection Manager
const connectionManager = new MCPConnectionManager();
app.set('mcpConnectionManager', connectionManager);

// Health check endpoint (no auth required)
app.use('/health', healthRouter);

// API routes (auth required)
app.use('/api/v1/servers', authMiddleware, serversRouter);
app.use('/api/v1/mcp', authMiddleware, mcpRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Heroku MCP Host',
    version: '1.0.0',
    description: 'MCP Host for Salesforce Apex/Flow integration',
    endpoints: {
      health: '/health',
      servers: '/api/v1/servers',
      tools: '/api/v1/mcp/:serverName/tools',
      callTool: '/api/v1/mcp/:serverName/tools/call',
      resources: '/api/v1/mcp/:serverName/resources',
      readResource: '/api/v1/mcp/:serverName/resources/read',
      prompts: '/api/v1/mcp/:serverName/prompts',
      getPrompt: '/api/v1/mcp/:serverName/prompts/get',
    },
    documentation: 'See README.md for full API documentation',
  });
});

// Error handling
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
  });
});

// Start server
async function startServer() {
  try {
    // Initialize configured MCP servers
    await connectionManager.initializeFromConfig();
    
    app.listen(PORT, HOST, () => {
      logger.info(`🚀 Heroku MCP Host running on http://${HOST}:${PORT}`);
      logger.info(`📡 Ready to bridge Salesforce with MCP servers`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await connectionManager.disconnectAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully...');
  await connectionManager.disconnectAll();
  process.exit(0);
});

startServer();
