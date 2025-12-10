import { Router } from 'express';
import { logger } from '../utils/logger.js';

export const mcpRouter = Router();

/**
 * Handle OAuth authorization required errors
 */
function handleOAuthError(error, res) {
  if (error.name === 'OAuthAuthorizationRequired') {
    return res.status(401).json({
      success: false,
      error: 'OAuth Authorization Required',
      message: error.message,
      authorizationUrl: error.authorizationUrl,
      state: error.state,
      expiresIn: error.expiresIn,
    });
  }
  return null;
}

/**
 * Get connection manager and establish connection to server
 */
async function getServerConnection(req, serverName) {
  const connectionManager = req.app.get('mcpConnectionManager');
  return await connectionManager.getConnection(serverName);
}

/**
 * List tools available on an MCP server
 * 
 * Apex usage:
 * HttpRequest req = new HttpRequest();
 * req.setEndpoint('https://your-heroku-app.herokuapp.com/api/v1/mcp/serverName/tools');
 * req.setMethod('GET');
 * req.setHeader('X-API-Key', 'your-api-key');
 */
mcpRouter.get('/:serverName/tools', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const client = await getServerConnection(req, serverName);
    
    const tools = await client.listTools();
    
    res.json({
      success: true,
      serverName,
      tools,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * Call a tool on an MCP server
 * 
 * Apex usage:
 * HttpRequest req = new HttpRequest();
 * req.setEndpoint('https://your-heroku-app.herokuapp.com/api/v1/mcp/serverName/tools/call');
 * req.setMethod('POST');
 * req.setHeader('X-API-Key', 'your-api-key');
 * req.setHeader('Content-Type', 'application/json');
 * req.setBody('{"tool": "toolName", "arguments": {"arg1": "value1"}}');
 */
mcpRouter.post('/:serverName/tools/call', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const { tool, arguments: args } = req.body;
    
    if (!tool) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Tool name is required',
      });
    }
    
    const client = await getServerConnection(req, serverName);
    
    logger.info(`Calling tool via API`, { serverName, tool, args });
    
    const result = await client.callTool(tool, args || {});
    
    res.json({
      success: true,
      serverName,
      tool,
      result,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * List resources available on an MCP server
 */
mcpRouter.get('/:serverName/resources', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const client = await getServerConnection(req, serverName);
    
    const resources = await client.listResources();
    
    res.json({
      success: true,
      serverName,
      resources,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * Read a resource from an MCP server
 * 
 * Apex usage:
 * HttpRequest req = new HttpRequest();
 * req.setEndpoint('https://your-heroku-app.herokuapp.com/api/v1/mcp/serverName/resources/read');
 * req.setMethod('POST');
 * req.setHeader('X-API-Key', 'your-api-key');
 * req.setHeader('Content-Type', 'application/json');
 * req.setBody('{"uri": "resource://example/resource"}');
 */
mcpRouter.post('/:serverName/resources/read', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const { uri } = req.body;
    
    if (!uri) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Resource URI is required',
      });
    }
    
    const client = await getServerConnection(req, serverName);
    
    const result = await client.readResource(uri);
    
    res.json({
      success: true,
      serverName,
      uri,
      result,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * List resource templates from an MCP server
 */
mcpRouter.get('/:serverName/resources/templates', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const client = await getServerConnection(req, serverName);
    
    const templates = await client.listResourceTemplates();
    
    res.json({
      success: true,
      serverName,
      templates,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * List prompts available on an MCP server
 */
mcpRouter.get('/:serverName/prompts', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const client = await getServerConnection(req, serverName);
    
    const prompts = await client.listPrompts();
    
    res.json({
      success: true,
      serverName,
      prompts,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * Get a prompt from an MCP server
 * 
 * Apex usage:
 * HttpRequest req = new HttpRequest();
 * req.setEndpoint('https://your-heroku-app.herokuapp.com/api/v1/mcp/serverName/prompts/get');
 * req.setMethod('POST');
 * req.setHeader('X-API-Key', 'your-api-key');
 * req.setHeader('Content-Type', 'application/json');
 * req.setBody('{"prompt": "promptName", "arguments": {"arg1": "value1"}}');
 */
mcpRouter.post('/:serverName/prompts/get', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const { prompt, arguments: args } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Prompt name is required',
      });
    }
    
    const client = await getServerConnection(req, serverName);
    
    const result = await client.getPrompt(prompt, args || {});
    
    res.json({
      success: true,
      serverName,
      prompt,
      result,
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});

/**
 * Get server capabilities
 */
mcpRouter.get('/:serverName/capabilities', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const client = await getServerConnection(req, serverName);
    
    res.json({
      success: true,
      serverName,
      capabilities: client.getCapabilities(),
      serverInfo: client.getServerInfo(),
    });
  } catch (error) {
    const oauthResponse = handleOAuthError(error, res);
    if (oauthResponse) return;
    next(error);
  }
});
