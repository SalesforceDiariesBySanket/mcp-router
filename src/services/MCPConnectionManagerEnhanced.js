import { logger } from '../utils/logger.js';
import { MCPClientEnhanced, TransportType, AuthType } from './MCPClientEnhanced.js';
import { oauthManager } from './OAuthManager.js';

/**
 * Enhanced MCP Connection Manager with OAuth 2.1 and multiple transport support
 */
export class MCPConnectionManagerEnhanced {
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
        this.configs.set(name, this.normalizeConfig(config));
        logger.info(`Registered MCP server: ${name}`, { 
          url: config.url, 
          transport: config.transport || 'sse',
          authType: config.authType || 'none',
        });
      }
      
      logger.info(`Registered ${this.configs.size} MCP server(s) from configuration`);
    } catch (error) {
      logger.error('Failed to parse MCP_SERVERS configuration:', error);
      throw new Error('Invalid MCP_SERVERS configuration format');
    }
  }

  /**
   * Normalize server configuration
   */
  normalizeConfig(config) {
    return {
      url: config.url,
      transport: config.transport || TransportType.SSE,
      authType: config.authType || AuthType.NONE,
      // API Key / Bearer Token auth
      apiKey: config.apiKey,
      bearerToken: config.bearerToken,
      // OAuth 2.1 settings
      oauth: {
        clientId: config.oauth?.clientId || config.clientId,
        clientSecret: config.oauth?.clientSecret || config.clientSecret,
        scopes: config.oauth?.scopes || config.scopes || [],
        clientMetadata: config.oauth?.clientMetadata,
        // Custom OAuth metadata URL (for remote MCP servers like Atlassian)
        metadataUrl: config.oauth?.metadataUrl,
        // Custom callback URL
        callbackUrl: config.oauth?.callbackUrl,
      },
      // Custom headers (legacy support)
      headers: config.headers || {},
      // Timeout settings
      timeout: config.timeout || parseInt(process.env.MCP_TIMEOUT) || 30000,
    };
  }

  /**
   * Register a new MCP server configuration
   */
  registerServer(name, config) {
    if (!config.url) {
      throw new Error('Server configuration must include a URL');
    }
    
    const normalizedConfig = this.normalizeConfig(config);
    this.configs.set(name, normalizedConfig);
    
    logger.info(`Registered MCP server: ${name}`, { 
      url: config.url,
      transport: normalizedConfig.transport,
      authType: normalizedConfig.authType,
    });
  }

  /**
   * Update server configuration
   */
  async updateServer(name, config) {
    const existing = this.configs.get(name);
    if (!existing) {
      throw new Error(`MCP server '${name}' is not registered`);
    }

    // Disconnect existing connection
    await this.disconnect(name);

    // Merge configurations
    const updated = this.normalizeConfig({
      ...existing,
      ...config,
      oauth: {
        ...existing.oauth,
        ...config.oauth,
      },
      headers: {
        ...existing.headers,
        ...config.headers,
      },
    });

    this.configs.set(name, updated);
    logger.info(`Updated MCP server configuration: ${name}`);
  }

  /**
   * Remove a server configuration
   */
  async removeServer(name) {
    await this.disconnect(name);
    
    // Revoke any OAuth tokens
    await oauthManager.revokeTokens(name);
    
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

    // Create new connection with enhanced client
    const client = new MCPClientEnhanced(serverName, config);
    
    try {
      await client.connect();
      this.connections.set(serverName, client);
      return client;
    } catch (error) {
      // Re-throw OAuth authorization errors with additional context
      if (error.name === 'OAuthAuthorizationRequired') {
        throw error;
      }
      throw error;
    }
  }

  /**
   * Initiate OAuth flow for a server
   */
  async initiateOAuthFlow(serverName, options = {}) {
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`MCP server '${serverName}' is not registered`);
    }

    return await oauthManager.initiateAuthorizationFlow(
      serverName,
      config.url,
      {
        clientId: config.oauth?.clientId || options.clientId,
        clientSecret: config.oauth?.clientSecret || options.clientSecret,
        scopes: config.oauth?.scopes || options.scopes,
        clientMetadata: config.oauth?.clientMetadata || options.clientMetadata,
        // Pass custom OAuth metadata URL and callback URL for remote servers
        metadataUrl: config.oauth?.metadataUrl || options.metadataUrl,
        callbackUrl: config.oauth?.callbackUrl || options.callbackUrl,
        ...options,
      }
    );
  }

  /**
   * Complete OAuth flow with authorization code
   */
  async completeOAuthFlow(code, state) {
    return await oauthManager.handleCallback(code, state);
  }

  /**
   * Perform client credentials grant for a server
   */
  async performClientCredentialsGrant(serverName) {
    const config = this.configs.get(serverName);
    if (!config) {
      throw new Error(`MCP server '${serverName}' is not registered`);
    }

    if (!config.oauth?.clientId || !config.oauth?.clientSecret) {
      throw new Error('Client ID and secret are required for client credentials grant');
    }

    return await oauthManager.clientCredentialsGrant(
      serverName,
      config.url,
      config.oauth.clientId,
      config.oauth.clientSecret,
      config.oauth.scopes || []
    );
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
      const oauthStatus = oauthManager.getTokenStatus(name);
      
      servers.push({
        name,
        url: config.url,
        transport: config.transport,
        authType: config.authType,
        connected: connection?.isConnected() || false,
        capabilities: connection?.getCapabilities() || null,
        oauth: config.authType === AuthType.OAUTH2 || 
               config.authType === AuthType.OAUTH2_CLIENT_CREDENTIALS
          ? oauthStatus
          : undefined,
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
    const oauthStatus = oauthManager.getTokenStatus(serverName);

    return {
      name: serverName,
      url: config.url,
      transport: config.transport,
      authType: config.authType,
      connected: connection?.isConnected() || false,
      capabilities: connection?.getCapabilities() || null,
      serverInfo: connection?.getServerInfo() || null,
      oauth: config.authType === AuthType.OAUTH2 || 
             config.authType === AuthType.OAUTH2_CLIENT_CREDENTIALS
        ? oauthStatus
        : undefined,
    };
  }

  /**
   * Check if OAuth authorization is required for a server
   */
  requiresOAuthAuthorization(serverName) {
    const config = this.configs.get(serverName);
    if (!config) {
      return false;
    }

    if (config.authType !== AuthType.OAUTH2) {
      return false;
    }

    return !oauthManager.hasValidTokens(serverName);
  }

  /**
   * Get OAuth status for a server
   */
  getOAuthStatus(serverName) {
    return oauthManager.getTokenStatus(serverName);
  }

  /**
   * Revoke OAuth tokens for a server
   */
  async revokeOAuthTokens(serverName) {
    await oauthManager.revokeTokens(serverName);
    
    // Disconnect if connected
    await this.disconnect(serverName);
    
    logger.info(`Revoked OAuth tokens for ${serverName}`);
  }
}
