import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { mcpRouter } from './routes/mcp.js';
import { healthRouter } from './routes/health.js';
import { serversRouter } from './routes/serversEnhanced.js';
import { oauthRouter } from './routes/oauth.js';
import { MCPConnectionManagerEnhanced } from './services/MCPConnectionManagerEnhanced.js';
import { AuthType, TransportType } from './services/MCPClientEnhanced.js';

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

// Initialize Enhanced MCP Connection Manager
const connectionManager = new MCPConnectionManagerEnhanced();
app.set('mcpConnectionManager', connectionManager);

// Health check endpoint (no auth required)
app.use('/health', healthRouter);

// Atlassian domain verification (no auth required)
app.get('/atlassian-domain-verification-426744cf-46e4-4828-806a-31fc710c3239.html', (req, res) => {
  res.type('html').send(`<!DOCTYPE html>
<html>
<head>
<meta name="robots" content="noindex">
</head>
<body>
<h1>Domain Verification Token</h1>
<code id="domain-verification-token" data-value="4iNlF5teeF81NOMCb/EbzHHPqwUCv7uVhjCUM0vV67dDeBTcdNvx801S4mcqiejR">4iNlF5teeF81NOMCb/EbzHHPqwUCv7uVhjCUM0vV67dDeBTcdNvx801S4mcqiejR</code>
<!-- 4iNlF5teeF81NOMCb/EbzHHPqwUCv7uVhjCUM0vV67dDeBTcdNvx801S4mcqiejR -->
</body>
</html>`);
});

// OAuth callback endpoint (no auth required - called by OAuth servers)
app.use('/oauth', oauthRouter);

// API routes (auth required)
app.use('/api/v1/servers', authMiddleware, serversRouter);
app.use('/api/v1/mcp', authMiddleware, mcpRouter);
app.use('/api/v1/oauth', authMiddleware, oauthRouter);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Heroku MCP Host',
    version: '2.0.0',
    description: 'MCP Host for Salesforce Apex/Flow integration with OAuth 2.1 support',
    features: [
      'Multiple transport support (SSE, Streamable HTTP)',
      'OAuth 2.1 with PKCE for browser-based authentication',
      'OAuth 2.1 Client Credentials for server-to-server auth',
      'API Key and Bearer Token authentication',
      'Dynamic client registration (RFC7591)',
      'Automatic token refresh',
    ],
    authentication: {
      supportedTypes: Object.values(AuthType),
      description: 'Servers can be configured with different authentication methods',
    },
    transports: {
      supportedTypes: Object.values(TransportType),
      description: 'Multiple MCP transport protocols supported',
    },
    endpoints: {
      health: '/health',
      servers: '/api/v1/servers',
      serverOptions: '/api/v1/servers/config/options',
      tools: '/api/v1/mcp/:serverName/tools',
      callTool: '/api/v1/mcp/:serverName/tools/call',
      resources: '/api/v1/mcp/:serverName/resources',
      readResource: '/api/v1/mcp/:serverName/resources/read',
      prompts: '/api/v1/mcp/:serverName/prompts',
      getPrompt: '/api/v1/mcp/:serverName/prompts/get',
      oauthCallback: '/oauth/callback',
      oauthInitiate: '/api/v1/oauth/initiate/:serverName',
      oauthStatus: '/api/v1/oauth/token-status/:serverName',
      oauthRevoke: '/api/v1/oauth/revoke/:serverName',
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
      logger.info(`🚀 Heroku MCP Host v2.0.0 running on http://${HOST}:${PORT}`);
      logger.info(`📡 Ready to bridge Salesforce with MCP servers`);
      logger.info(`🔐 OAuth 2.1 support enabled`);
      logger.info(`🔌 Supported transports: ${Object.values(TransportType).join(', ')}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await connectionManager.disconnectAll();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await connectionManager.disconnectAll();
  process.exit(0);
});

startServer();
