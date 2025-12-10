import { Router } from 'express';
import { logger } from '../utils/logger.js';

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
 */
serversRouter.post('/', async (req, res, next) => {
  try {
    const { name, url, transport, headers, timeout } = req.body;
    
    if (!name || !url) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Server name and URL are required',
      });
    }
    
    const connectionManager = req.app.get('mcpConnectionManager');
    
    connectionManager.registerServer(name, {
      url,
      transport: transport || 'sse',
      headers: headers || {},
      timeout: timeout || 30000,
    });
    
    logger.info(`Registered new MCP server via API: ${name}`);
    
    res.status(201).json({
      success: true,
      message: `Server '${name}' registered successfully`,
      server: connectionManager.getServerStatus(name),
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
    
    await connectionManager.getConnection(serverName);
    
    res.json({
      success: true,
      message: `Connected to server '${serverName}'`,
      server: connectionManager.getServerStatus(serverName),
    });
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
