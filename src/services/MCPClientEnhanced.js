import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../utils/logger.js';
import { oauthManager } from './OAuthManager.js';

/**
 * MCP Protocol Version
 */
export const MCP_PROTOCOL_VERSION = '2025-03-26';

/**
 * Transport types supported by the MCP Host
 */
export const TransportType = {
  SSE: 'sse',
  STREAMABLE_HTTP: 'streamable-http',
  HTTP_SSE: 'http-sse', // Legacy HTTP+SSE transport
};

/**
 * Authentication types supported
 */
export const AuthType = {
  NONE: 'none',
  API_KEY: 'api-key',
  BEARER_TOKEN: 'bearer-token',
  OAUTH2: 'oauth2',
  OAUTH2_CLIENT_CREDENTIALS: 'oauth2-client-credentials',
};

/**
 * Enhanced MCP Client wrapper with multiple transport and auth support
 */
export class MCPClientEnhanced {
  constructor(name, config) {
    this.name = name;
    this.config = this.normalizeConfig(config);
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.capabilities = null;
    this.serverInfo = null;
    this.sessionId = null;
  }

  /**
   * Normalize and validate configuration
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
      oauth: config.oauth || {},
      // Custom headers
      headers: config.headers || {},
      // Timeout settings
      timeout: config.timeout || parseInt(process.env.MCP_TIMEOUT) || 30000,
      // Retry settings
      maxRetries: config.maxRetries || 3,
      retryDelay: config.retryDelay || 1000,
    };
  }

  /**
   * Build authentication headers based on auth type
   */
  async buildAuthHeaders() {
    const headers = { 
      ...this.config.headers,
      'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
    };

    switch (this.config.authType) {
      case AuthType.API_KEY:
        if (this.config.apiKey) {
          headers['X-API-Key'] = this.config.apiKey;
        }
        break;

      case AuthType.BEARER_TOKEN:
        if (this.config.bearerToken) {
          headers['Authorization'] = `Bearer ${this.config.bearerToken}`;
        }
        break;

      case AuthType.OAUTH2:
      case AuthType.OAUTH2_CLIENT_CREDENTIALS:
        const accessToken = await oauthManager.getAccessToken(this.name);
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
          throw new Error(`No valid OAuth token available for ${this.name}. Authorization required.`);
        }
        break;

      case AuthType.NONE:
      default:
        // No authentication headers needed
        break;
    }

    return headers;
  }

  /**
   * Check if OAuth authorization is required
   */
  requiresOAuthAuthorization() {
    if (this.config.authType !== AuthType.OAUTH2) {
      return false;
    }
    return !oauthManager.hasValidTokens(this.name);
  }

  /**
   * Initiate OAuth authorization flow
   */
  async initiateOAuthFlow(options = {}) {
    return await oauthManager.initiateAuthorizationFlow(
      this.name,
      this.config.url,
      {
        clientId: this.config.oauth.clientId,
        clientSecret: this.config.oauth.clientSecret,
        scopes: this.config.oauth.scopes,
        clientMetadata: this.config.oauth.clientMetadata,
        // Pass custom OAuth metadata URL and callback URL for remote servers
        metadataUrl: this.config.oauth.metadataUrl,
        callbackUrl: this.config.oauth.callbackUrl,
        ...options,
      }
    );
  }

  /**
   * Perform OAuth client credentials grant
   */
  async performClientCredentialsGrant() {
    if (this.config.authType !== AuthType.OAUTH2_CLIENT_CREDENTIALS) {
      throw new Error('Client credentials grant requires oauth2-client-credentials auth type');
    }

    const { clientId, clientSecret, scopes } = this.config.oauth;
    
    if (!clientId || !clientSecret) {
      throw new Error('Client ID and secret are required for client credentials grant');
    }

    return await oauthManager.clientCredentialsGrant(
      this.name,
      this.config.url,
      clientId,
      clientSecret,
      scopes || []
    );
  }

  /**
   * Probe remote MCP server for OAuth requirements
   * Some remote MCP servers (like Atlassian) require OAuth but need to be probed first
   */
  async probeForOAuthRequirements() {
    try {
      const response = await fetch(this.config.url, {
        method: 'GET',
        headers: {
          'Accept': 'text/event-stream',
          'MCP-Protocol-Version': MCP_PROTOCOL_VERSION,
        },
      });
      
      // Check for 401/403 which indicates auth required
      if (response.status === 401 || response.status === 403) {
        const wwwAuth = response.headers.get('WWW-Authenticate');
        if (wwwAuth) {
          logger.info(`Remote MCP server requires OAuth: ${this.name}`, { wwwAuth });
          return { requiresAuth: true, wwwAuthenticate: wwwAuth };
        }
        return { requiresAuth: true };
      }
      
      return { requiresAuth: false };
    } catch (error) {
      // Network errors might indicate the server needs auth
      logger.debug(`OAuth probe failed for ${this.name}:`, error.message);
      return { requiresAuth: false, error: error.message };
    }
  }

  /**
   * Connect to the MCP server using appropriate transport
   */
  async connect() {
    try {
      logger.info(`Connecting to MCP server: ${this.name}`, { 
        url: this.config.url,
        transport: this.config.transport,
        authType: this.config.authType,
      });

      // Handle OAuth client credentials grant before connecting
      if (this.config.authType === AuthType.OAUTH2_CLIENT_CREDENTIALS) {
        if (!oauthManager.hasValidTokens(this.name)) {
          await this.performClientCredentialsGrant();
        }
      }

      // Check if OAuth authorization is required
      if (this.requiresOAuthAuthorization()) {
        const authInfo = await this.initiateOAuthFlow();
        const error = new Error(`OAuth authorization required for ${this.name}`);
        error.name = 'OAuthAuthorizationRequired';
        error.authorizationUrl = authInfo.authorizationUrl;
        error.state = authInfo.state;
        error.expiresIn = authInfo.expiresIn;
        throw error;
      }

      // For servers that might auto-detect OAuth needs, probe first if no auth configured
      if (this.config.authType === AuthType.NONE) {
        const probeResult = await this.probeForOAuthRequirements();
        if (probeResult.requiresAuth) {
          logger.info(`Server ${this.name} requires OAuth authentication`);
          // Upgrade to OAuth2 auth type
          this.config.authType = AuthType.OAUTH2;
          const authInfo = await this.initiateOAuthFlow();
          const error = new Error(`OAuth authorization required for ${this.name}`);
          error.name = 'OAuthAuthorizationRequired';
          error.authorizationUrl = authInfo.authorizationUrl;
          error.state = authInfo.state;
          error.expiresIn = authInfo.expiresIn;
          throw error;
        }
      }

      // Build authentication headers
      const headers = await this.buildAuthHeaders();

      // Create the MCP client
      this.client = new Client(
        {
          name: 'heroku-mcp-host',
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
        }
      );

      // Create transport based on type
      await this.createTransport(headers);

      // Connect
      await this.client.connect(this.transport);
      
      this.connected = true;
      this.serverInfo = this.client.getServerVersion?.() || null;
      this.capabilities = this.client.getServerCapabilities?.() || null;

      logger.info(`Connected to MCP server: ${this.name}`, {
        serverInfo: this.serverInfo,
        capabilities: this.capabilities,
        transport: this.config.transport,
      });

    } catch (error) {
      // Handle 401 Unauthorized - trigger OAuth flow if applicable
      if (error.message?.includes('401') || error.code === 401) {
        if (this.config.authType === AuthType.OAUTH2 || 
            this.config.authType === AuthType.OAUTH2_CLIENT_CREDENTIALS) {
          // Clear existing tokens and retry with fresh auth
          await oauthManager.revokeTokens(this.name);
          
          if (this.config.authType === AuthType.OAUTH2) {
            const authInfo = await this.initiateOAuthFlow();
            const authError = new Error(`OAuth re-authorization required for ${this.name}`);
            authError.name = 'OAuthAuthorizationRequired';
            authError.authorizationUrl = authInfo.authorizationUrl;
            authError.state = authInfo.state;
            throw authError;
          }
        }
      }

      logger.error(`Failed to connect to MCP server ${this.name}:`, error);
      this.connected = false;
      throw error;
    }
  }

  /**
   * Create appropriate transport based on configuration
   */
  async createTransport(headers) {
    const url = new URL(this.config.url);

    switch (this.config.transport) {
      case TransportType.STREAMABLE_HTTP:
        // Streamable HTTP transport (MCP 2025-03-26)
        this.transport = await this.createStreamableHttpTransport(url, headers);
        break;

      case TransportType.HTTP_SSE:
        // Legacy HTTP+SSE transport (MCP 2024-11-05)
        this.transport = await this.createLegacyHttpSseTransport(url, headers);
        break;

      case TransportType.SSE:
      default:
        // Standard SSE transport
        this.transport = new SSEClientTransport(url, {
          requestInit: {
            headers,
          },
        });
        break;
    }
  }

  /**
   * Create Streamable HTTP transport
   * Implements the MCP 2025-03-26 specification
   */
  async createStreamableHttpTransport(url, headers) {
    // The SDK's SSEClientTransport should handle streamable HTTP
    // For now, we use the SSE transport with proper headers
    return new SSEClientTransport(url, {
      requestInit: {
        headers: {
          ...headers,
          'Accept': 'application/json, text/event-stream',
        },
      },
    });
  }

  /**
   * Create legacy HTTP+SSE transport for backwards compatibility
   */
  async createLegacyHttpSseTransport(url, headers) {
    // Legacy transport uses GET for SSE stream
    return new SSEClientTransport(url, {
      requestInit: {
        headers,
      },
    });
  }

  /**
   * Disconnect from the MCP server
   */
  async disconnect() {
    try {
      if (this.client) {
        await this.client.close();
      }
      this.connected = false;
      this.client = null;
      this.transport = null;
      this.sessionId = null;
      logger.info(`Disconnected from MCP server: ${this.name}`);
    } catch (error) {
      logger.error(`Error disconnecting from ${this.name}:`, error);
      throw error;
    }
  }

  /**
   * Check if connected
   */
  isConnected() {
    return this.connected && this.client !== null;
  }

  /**
   * Get OAuth status for this server
   */
  getOAuthStatus() {
    if (this.config.authType !== AuthType.OAUTH2 && 
        this.config.authType !== AuthType.OAUTH2_CLIENT_CREDENTIALS) {
      return null;
    }
    return oauthManager.getTokenStatus(this.name);
  }

  /**
   * Get server capabilities
   */
  getCapabilities() {
    return this.capabilities;
  }

  /**
   * Get server info
   */
  getServerInfo() {
    return this.serverInfo;
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * List available tools
   */
  async listTools() {
    await this.ensureConnected();
    try {
      const result = await this.client.listTools();
      return result.tools || [];
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * Call a tool
   */
  async callTool(toolName, args = {}) {
    await this.ensureConnected();
    try {
      logger.info(`Calling tool: ${toolName}`, { server: this.name, args });
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      return result;
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * List available resources
   */
  async listResources() {
    await this.ensureConnected();
    try {
      const result = await this.client.listResources();
      return result.resources || [];
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * Read a resource
   */
  async readResource(uri) {
    await this.ensureConnected();
    try {
      logger.info(`Reading resource: ${uri}`, { server: this.name });
      const result = await this.client.readResource({ uri });
      return result;
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * List resource templates
   */
  async listResourceTemplates() {
    await this.ensureConnected();
    try {
      const result = await this.client.listResourceTemplates();
      return result.resourceTemplates || [];
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * List available prompts
   */
  async listPrompts() {
    await this.ensureConnected();
    try {
      const result = await this.client.listPrompts();
      return result.prompts || [];
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * Get a prompt
   */
  async getPrompt(promptName, args = {}) {
    await this.ensureConnected();
    try {
      logger.info(`Getting prompt: ${promptName}`, { server: this.name, args });
      const result = await this.client.getPrompt({
        name: promptName,
        arguments: args,
      });
      return result;
    } catch (error) {
      await this.handleError(error);
      throw this.wrapError(error);
    }
  }

  /**
   * Ensure the client is connected, reconnecting if necessary
   */
  async ensureConnected() {
    if (!this.isConnected()) {
      await this.connect();
    }
  }

  /**
   * Handle errors, including auth-related errors
   */
  async handleError(error) {
    // Handle 401 Unauthorized
    if (error.message?.includes('401') || error.code === 401) {
      this.connected = false;
      
      if (this.config.authType === AuthType.OAUTH2 ||
          this.config.authType === AuthType.OAUTH2_CLIENT_CREDENTIALS) {
        // Try to refresh token
        try {
          await oauthManager.refreshAccessToken(this.name);
          // Reconnect with new token
          await this.connect();
          return; // Successfully recovered
        } catch (refreshError) {
          logger.error(`Failed to refresh token for ${this.name}:`, refreshError);
        }
      }
    }
  }

  /**
   * Wrap errors with appropriate type
   */
  wrapError(error) {
    if (error.name === 'ConnectionError' || 
        error.name === 'MCPError' || 
        error.name === 'OAuthAuthorizationRequired') {
      return error;
    }
    const wrappedError = new Error(error.message);
    wrappedError.name = 'MCPError';
    wrappedError.code = error.code;
    wrappedError.originalError = error;
    return wrappedError;
  }
}
