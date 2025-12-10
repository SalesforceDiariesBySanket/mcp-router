import { logger } from '../utils/logger.js';
import { MCPClient } from './MCPClient.js';

/**
 * Manages multiple MCP server connections
 */
export class MCPConnectionManager {
  constructor() {
    this.connections = new Map();
    this.configs = new Map();
  }

  /**
   * Initialize connections from environment configuration
   */
  async initializeFromConfig() {
    const serversConfig = process.env.MCP_SERVERS;
    
    if (!serversConfig) {
      logger.info('No MCP_SERVERS configured. Servers can be added dynamically via API.');
      return;
    }

    try {
      const servers = JSON.parse(serversConfig);
      
      for (const [name, config] of Object.entries(servers)) {
        this.configs.set(name, config);
        logger.info(`Registered MCP server: ${name}`, { url: config.url, transport: config.transport });
      }
      
      logger.info(`Registered ${this.configs.size} MCP server(s) from configuration`);
    } catch (error) {
      logger.error('Failed to parse MCP_SERVERS configuration:', error);
      throw new Error('Invalid MCP_SERVERS configuration format');
    }
  }

  /**
   * Register a new MCP server configuration
   */
  registerServer(name, config) {
    if (!config.url) {
      throw new Error('Server configuration must include a URL');
    }
    
    this.configs.set(name, {
      url: config.url,
      transport: config.transport || 'sse',
      headers: config.headers || {},
      timeout: config.timeout || parseInt(process.env.MCP_TIMEOUT) || 30000,
    });
    
    logger.info(`Registered MCP server: ${name}`, { url: config.url });
  }

  /**
   * Remove a server configuration
   */
  async removeServer(name) {
    await this.disconnect(name);
    this.configs.delete(name);
    logger.info(`Removed MCP server: ${name}`);
  }

  /**
   * Get or create a connection to an MCP server
   */
  async getConnection(serverName) {
    // Check if we have an active connection
    if (this.connections.has(serverName)) {
      const client = this.connections.get(serverName);
      if (client.isConnected()) {
        return client;
      }
      // Connection is stale, remove it
      this.connections.delete(serverName);
    }

    // Get the server configuration
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`MCP server '${serverName}' is not registered`);
    }

    // Create new connection
    const client = new MCPClient(serverName, config);
    await client.connect();
    
    this.connections.set(serverName, client);
    return client;
  }

  /**
   * Disconnect from a specific server
   */
  async disconnect(serverName) {
    const client = this.connections.get(serverName);
    if (client) {
      await client.disconnect();
      this.connections.delete(serverName);
      logger.info(`Disconnected from MCP server: ${serverName}`);
    }
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll() {
    const disconnectPromises = [];
    for (const [name, client] of this.connections) {
      disconnectPromises.push(
        client.disconnect().catch(err => {
          logger.error(`Error disconnecting from ${name}:`, err);
        })
      );
    }
    await Promise.all(disconnectPromises);
    this.connections.clear();
    logger.info('Disconnected from all MCP servers');
  }

  /**
   * List all registered servers
   */
  listServers() {
    const servers = [];
    for (const [name, config] of this.configs) {
      const connection = this.connections.get(name);
      servers.push({
        name,
        url: config.url,
        transport: config.transport,
        connected: connection?.isConnected() || false,
        capabilities: connection?.getCapabilities() || null,
      });
    }
    return servers;
  }

  /**
   * Get server status
   */
  getServerStatus(serverName) {
    const config = this.configs.get(serverName);
    if (!config) {
      return null;
    }

    const connection = this.connections.get(serverName);
    return {
      name: serverName,
      url: config.url,
      transport: config.transport,
      connected: connection?.isConnected() || false,
      capabilities: connection?.getCapabilities() || null,
      serverInfo: connection?.getServerInfo() || null,
    };
  }
}
