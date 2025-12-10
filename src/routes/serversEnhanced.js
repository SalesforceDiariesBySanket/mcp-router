import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { AuthType, TransportType } from '../services/MCPClientEnhanced.js';

export const serversRouter = Router();

/**
 * List all registered MCP servers
 */
serversRouter.get('/', (req, res) => {
  const connectionManager = req.app.get('mcpConnectionManager');
  const servers = connectionManager.listServers();
  
  res.json({
    success: true,
    servers,
    supportedAuthTypes: Object.values(AuthType),
    supportedTransports: Object.values(TransportType),
  });
});

/**
 * Get status of a specific server
 */
serversRouter.get('/:serverName', (req, res) => {
  const { serverName } = req.params;
  const connectionManager = req.app.get('mcpConnectionManager');
  
  const status = connectionManager.getServerStatus(serverName);
  
  if (!status) {
    return res.status(404).json({
      success: false,
      error: 'Server not found',
      message: `MCP server '${serverName}' is not registered`,
    });
  }
  
  res.json({
    success: true,
    server: status,
  });
});

/**
 * Register a new MCP server
 * 
 * Supported configurations:
 * 
 * 1. No authentication:
 * {
 *   "name": "myserver",
 *   "url": "https://mcp-server.example.com/sse",
 *   "transport": "sse",
 *   "authType": "none"
 * }
 * 
 * 2. API Key authentication:
 * {
 *   "name": "myserver",
 *   "url": "https://mcp-server.example.com/sse",
 *   "transport": "sse",
 *   "authType": "api-key",
 *   "apiKey": "your-api-key"
 * }
 * 
 * 3. Bearer Token authentication:
 * {
 *   "name": "myserver",
 *   "url": "https://mcp-server.example.com/sse",
 *   "transport": "sse",
 *   "authType": "bearer-token",
 *   "bearerToken": "your-token"
 * }
 * 
 * 4. OAuth 2.1 (Authorization Code with PKCE):
 * {
 *   "name": "atlassian",
 *   "url": "https://mcp.atlassian.com/v1/sse",
 *   "transport": "sse",
 *   "authType": "oauth2",
 *   "oauth": {
 *     "clientId": "your-client-id",
 *     "clientSecret": "optional-client-secret",
 *     "scopes": ["read", "write"]
 *   }
 * }
 * 
 * 5. OAuth 2.1 Client Credentials:
 * {
 *   "name": "myserver",
 *   "url": "https://mcp-server.example.com/sse",
 *   "transport": "sse",
 *   "authType": "oauth2-client-credentials",
 *   "oauth": {
 *     "clientId": "your-client-id",
 *     "clientSecret": "your-client-secret",
 *     "scopes": ["read", "write"]
 *   }
 * }
 * 
 * 6. Legacy headers (backwards compatible):
 * {
 *   "name": "myserver",
 *   "url": "https://mcp-server.example.com/sse",
 *   "transport": "sse",
 *   "headers": {
 *     "Authorization": "Bearer your-token"
 *   }
 * }
 */
serversRouter.post('/', async (req, res, next) => {
  try {
    const { 
      name, 
      url, 
      transport, 
      authType,
      apiKey,
      bearerToken,
      oauth,
      headers, 
      timeout 
    } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Server name and URL are required',
      });
    }

    // Validate transport type
    const validTransports = Object.values(TransportType);
    if (transport && !validTransports.includes(transport)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: `Invalid transport. Supported: ${validTransports.join(', ')}`,
      });
    }

    // Validate auth type
    const validAuthTypes = Object.values(AuthType);
    if (authType && !validAuthTypes.includes(authType)) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: `Invalid authType. Supported: ${validAuthTypes.join(', ')}`,
      });
    }

    // Validate OAuth configuration
    if (authType === AuthType.OAUTH2_CLIENT_CREDENTIALS) {
      if (!oauth?.clientId || !oauth?.clientSecret) {
        return res.status(400).json({
          success: false,
          error: 'Validation Error',
          message: 'OAuth clientId and clientSecret are required for client credentials grant',
        });
      }
    }
    
    const connectionManager = req.app.get('mcpConnectionManager');
    
    connectionManager.registerServer(name, {
      url,
      transport: transport || TransportType.SSE,
      authType: authType || (headers?.Authorization ? AuthType.BEARER_TOKEN : AuthType.NONE),
      apiKey,
      bearerToken: bearerToken || (headers?.Authorization?.startsWith('Bearer ') 
        ? headers.Authorization.substring(7) 
        : undefined),
      oauth: oauth || {},
      headers: headers || {},
      timeout: timeout || 30000,
    });
    
    logger.info(`Registered new MCP server via API: ${name}`);
    
    const status = connectionManager.getServerStatus(name);
    
    // Check if OAuth authorization is required
    if (authType === AuthType.OAUTH2) {
      if (connectionManager.requiresOAuthAuthorization(name)) {
        return res.status(201).json({
          success: true,
          message: `Server '${name}' registered. OAuth authorization required.`,
          server: status,
          oauthRequired: true,
          oauthInitiateUrl: `/api/v1/oauth/initiate/${name}`,
        });
      }
    }
    
    res.status(201).json({
      success: true,
      message: `Server '${name}' registered successfully`,
      server: status,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update server configuration
 */
serversRouter.put('/:serverName', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const updates = req.body;
    
    const connectionManager = req.app.get('mcpConnectionManager');
    
    const status = connectionManager.getServerStatus(serverName);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }
    
    await connectionManager.updateServer(serverName, updates);
    
    logger.info(`Updated MCP server via API: ${serverName}`);
    
    res.json({
      success: true,
      message: `Server '${serverName}' updated successfully`,
      server: connectionManager.getServerStatus(serverName),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Connect to a server
 */
serversRouter.post('/:serverName/connect', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const connectionManager = req.app.get('mcpConnectionManager');
    
    const status = connectionManager.getServerStatus(serverName);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }
    
    try {
      await connectionManager.getConnection(serverName);
      
      res.json({
        success: true,
        message: `Connected to server '${serverName}'`,
        server: connectionManager.getServerStatus(serverName),
      });
    } catch (error) {
      // Handle OAuth authorization required
      if (error.name === 'OAuthAuthorizationRequired') {
        return res.status(401).json({
          success: false,
          error: 'OAuth Authorization Required',
          message: `OAuth authorization is required for '${serverName}'`,
          authorizationUrl: error.authorizationUrl,
          state: error.state,
          expiresIn: error.expiresIn,
        });
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

/**
 * Disconnect from a server
 */
serversRouter.post('/:serverName/disconnect', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const connectionManager = req.app.get('mcpConnectionManager');
    
    await connectionManager.disconnect(serverName);
    
    res.json({
      success: true,
      message: `Disconnected from server '${serverName}'`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Remove a server registration
 */
serversRouter.delete('/:serverName', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const connectionManager = req.app.get('mcpConnectionManager');
    
    const status = connectionManager.getServerStatus(serverName);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }
    
    await connectionManager.removeServer(serverName);
    
    res.json({
      success: true,
      message: `Server '${serverName}' removed successfully`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get supported auth types and transports
 */
serversRouter.get('/config/options', (req, res) => {
  res.json({
    success: true,
    authTypes: [
      { value: AuthType.NONE, description: 'No authentication' },
      { value: AuthType.API_KEY, description: 'API Key in X-API-Key header' },
      { value: AuthType.BEARER_TOKEN, description: 'Bearer token in Authorization header' },
      { value: AuthType.OAUTH2, description: 'OAuth 2.1 Authorization Code with PKCE' },
      { value: AuthType.OAUTH2_CLIENT_CREDENTIALS, description: 'OAuth 2.1 Client Credentials Grant' },
    ],
    transports: [
      { value: TransportType.SSE, description: 'Server-Sent Events (default)' },
      { value: TransportType.STREAMABLE_HTTP, description: 'Streamable HTTP (MCP 2025-03-26)' },
      { value: TransportType.HTTP_SSE, description: 'Legacy HTTP+SSE (MCP 2024-11-05)' },
    ],
  });
});
