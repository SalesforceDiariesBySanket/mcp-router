import crypto from 'crypto';
import { logger } from '../utils/logger.js';

/**
 * OAuth 2.1 Manager for MCP servers
 * Implements OAuth 2.1 with PKCE for browser-based authentication flows
 * Supports: Authorization Code Grant, Client Credentials Grant
 */
export class OAuthManager {
  constructor() {
    // Store OAuth states keyed by state parameter
    this.pendingAuthorizations = new Map();
    // Store active tokens keyed by server name
    this.tokens = new Map();
    // Store server OAuth metadata
    this.serverMetadata = new Map();
    // Store dynamic client registrations
    this.clientRegistrations = new Map();
  }

  /**
   * Generate a cryptographically secure random string
   */
  generateRandomString(length = 32) {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate PKCE code verifier (43-128 characters)
   */
  generateCodeVerifier() {
    return this.generateRandomString(32); // 43 chars in base64url
  }

  /**
   * Generate PKCE code challenge from verifier (S256 method)
   */
  generateCodeChallenge(codeVerifier) {
    const hash = crypto.createHash('sha256').update(codeVerifier).digest();
    return hash.toString('base64url');
  }

  /**
   * Generate a unique state parameter
   */
  generateState() {
    return this.generateRandomString(16);
  }

  /**
   * Discover OAuth server metadata from MCP server
   * Following RFC8414 - OAuth 2.0 Authorization Server Metadata
   * Supports multiple discovery strategies for different MCP server types
   */
  async discoverServerMetadata(serverUrl, customMetadataUrl = null) {
    try {
      const url = new URL(serverUrl);
      const baseUrl = `${url.protocol}//${url.host}`;
      
      // Discovery strategies in order of preference:
      // 1. Custom metadata URL (if provided)
      // 2. MCP endpoint's .well-known path (for remote MCP servers like Atlassian)
      // 3. Base URL .well-known (standard OAuth 2.0)
      // 4. OpenID Connect discovery
      const discoveryUrls = [];
      
      if (customMetadataUrl) {
        discoveryUrls.push(customMetadataUrl);
      }
      
      // For remote MCP servers, try discovery relative to the SSE endpoint
      if (url.pathname && url.pathname !== '/') {
        // e.g., https://mcp.atlassian.com/v1/sse -> https://mcp.atlassian.com/.well-known/oauth-authorization-server
        discoveryUrls.push(`${baseUrl}/.well-known/oauth-authorization-server`);
        // Also try with the path prefix (e.g., /v1/.well-known/...)
        const pathPrefix = url.pathname.split('/').slice(0, -1).join('/');
        if (pathPrefix) {
          discoveryUrls.push(`${baseUrl}${pathPrefix}/.well-known/oauth-authorization-server`);
        }
      } else {
        discoveryUrls.push(`${baseUrl}/.well-known/oauth-authorization-server`);
      }
      
      // OpenID Connect discovery
      discoveryUrls.push(`${baseUrl}/.well-known/openid-configuration`);
      
      // Try each discovery URL
      for (const metadataUrl of discoveryUrls) {
        try {
          logger.info(`Attempting OAuth metadata discovery from: ${metadataUrl}`);
          
          const response = await fetch(metadataUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'MCP-Protocol-Version': '2025-03-26',
            },
          });

          if (response.ok) {
            const metadata = await response.json();
            this.serverMetadata.set(serverUrl, metadata);
            logger.info(`Discovered OAuth metadata for ${serverUrl}`, { 
              discoveredFrom: metadataUrl,
              issuer: metadata.issuer,
            });
            return metadata;
          }
        } catch (discoveryError) {
          logger.debug(`Discovery failed for ${metadataUrl}:`, discoveryError.message);
        }
      }

      // Fallback: Try HEAD request to MCP endpoint for OAuth challenge
      try {
        const mcpResponse = await fetch(serverUrl, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            'MCP-Protocol-Version': '2025-03-26',
          },
        });
        
        // Check for WWW-Authenticate header with OAuth metadata
        const wwwAuth = mcpResponse.headers.get('WWW-Authenticate');
        if (wwwAuth) {
          const metadata = this.parseWWWAuthenticateHeader(wwwAuth, baseUrl);
          if (metadata) {
            this.serverMetadata.set(serverUrl, metadata);
            logger.info(`Discovered OAuth metadata from WWW-Authenticate header for ${serverUrl}`);
            return metadata;
          }
        }
      } catch (mcpError) {
        logger.debug(`MCP endpoint probe failed:`, mcpError.message);
      }

      // Final fallback to default endpoints
      logger.info(`OAuth metadata discovery failed, using default endpoints for ${serverUrl}`);
      const defaultMetadata = {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      };
      
      this.serverMetadata.set(serverUrl, defaultMetadata);
      return defaultMetadata;

    } catch (error) {
      logger.error(`Error discovering OAuth metadata for ${serverUrl}:`, error);
      
      // Return fallback defaults
      const url = new URL(serverUrl);
      const baseUrl = `${url.protocol}//${url.host}`;
      
      return {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        registration_endpoint: `${baseUrl}/register`,
        response_types_supported: ['code'],
        grant_types_supported: ['authorization_code', 'client_credentials', 'refresh_token'],
        code_challenge_methods_supported: ['S256'],
      };
    }
  }

  /**
   * Parse WWW-Authenticate header for OAuth metadata (RFC 6750)
   */
  parseWWWAuthenticateHeader(header, baseUrl) {
    try {
      // Parse Bearer realm="...", authorization_uri="...", etc.
      const params = {};
      const regex = /(\w+)="([^"]*)"/g;
      let match;
      
      while ((match = regex.exec(header)) !== null) {
        params[match[1]] = match[2];
      }
      
      if (params.authorization_uri || params.realm) {
        return {
          issuer: params.realm || baseUrl,
          authorization_endpoint: params.authorization_uri || `${baseUrl}/authorize`,
          token_endpoint: params.token_uri || `${baseUrl}/token`,
          registration_endpoint: params.registration_uri,
          response_types_supported: ['code'],
          grant_types_supported: ['authorization_code', 'refresh_token'],
          code_challenge_methods_supported: ['S256'],
        };
      }
    } catch (e) {
      logger.debug('Failed to parse WWW-Authenticate header:', e);
    }
    return null;
  }

  /**
   * Dynamic Client Registration (RFC7591)
   */
  async registerClient(serverUrl, clientMetadata = {}) {
    try {
      const metadata = await this.discoverServerMetadata(serverUrl);
      const registrationEndpoint = metadata.registration_endpoint;

      if (!registrationEndpoint) {
        logger.warn(`No registration endpoint available for ${serverUrl}`);
        return null;
      }

      const defaultClientMetadata = {
        client_name: 'Heroku MCP Host',
        redirect_uris: [this.getCallbackUrl()],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none', // Public client
        ...clientMetadata,
      };

      logger.info(`Registering client at ${registrationEndpoint}`);

      const response = await fetch(registrationEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(defaultClientMetadata),
      });

      if (response.ok) {
        const registration = await response.json();
        this.clientRegistrations.set(serverUrl, registration);
        logger.info(`Successfully registered client for ${serverUrl}`, { 
          clientId: registration.client_id 
        });
        return registration;
      }

      const errorText = await response.text();
      logger.warn(`Client registration failed for ${serverUrl}: ${errorText}`);
      return null;

    } catch (error) {
      logger.error(`Error registering client for ${serverUrl}:`, error);
      return null;
    }
  }

  /**
   * Get callback URL for OAuth flow
   * Supports multiple deployment scenarios
   */
  getCallbackUrl(customCallbackUrl = null) {
    if (customCallbackUrl) {
      return customCallbackUrl;
    }
    
    // Priority: explicit APP_URL > HEROKU_APP_URL > HEROKU_APP_NAME > localhost
    let baseUrl = process.env.APP_URL;
    
    if (!baseUrl && process.env.HEROKU_APP_URL) {
      baseUrl = process.env.HEROKU_APP_URL;
    }
    
    if (!baseUrl && process.env.HEROKU_APP_NAME) {
      baseUrl = `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
    }
    
    if (!baseUrl) {
      const port = process.env.PORT || 3000;
      baseUrl = `http://localhost:${port}`;
    }
    
    // Ensure no trailing slash
    baseUrl = baseUrl.replace(/\/$/, '');
    
    return `${baseUrl}/oauth/callback`;
  }

  /**
   * Initiate OAuth 2.1 Authorization Code flow with PKCE
   * Returns authorization URL for user to visit
   * 
   * @param {string} serverName - Name/identifier for the server
   * @param {string} serverUrl - The MCP server URL
   * @param {Object} options - OAuth options
   * @param {string} options.clientId - OAuth client ID
   * @param {string} options.clientSecret - OAuth client secret (optional)
   * @param {string[]} options.scopes - OAuth scopes to request
   * @param {string} options.metadataUrl - Custom OAuth metadata URL (for remote servers)
   * @param {string} options.callbackUrl - Custom callback URL
   * @param {Object} options.clientMetadata - Metadata for dynamic client registration
   */
  async initiateAuthorizationFlow(serverName, serverUrl, options = {}) {
    // Use custom metadata URL if provided (useful for remote MCP servers)
    const metadata = await this.discoverServerMetadata(serverUrl, options.metadataUrl);
    
    // Try dynamic client registration if no client ID provided
    let clientId = options.clientId;
    if (!clientId) {
      const registration = this.clientRegistrations.get(serverUrl) ||
        await this.registerClient(serverUrl, options.clientMetadata);
      clientId = registration?.client_id;
    }

    if (!clientId) {
      throw new Error('No client ID available. Provide clientId or enable dynamic registration.');
    }

    // Generate PKCE values
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);
    const state = this.generateState();

    // Get callback URL (custom or default)
    const redirectUri = this.getCallbackUrl(options.callbackUrl);

    // Store pending authorization
    this.pendingAuthorizations.set(state, {
      serverName,
      serverUrl,
      codeVerifier,
      clientId,
      clientSecret: options.clientSecret,
      scopes: options.scopes || [],
      redirectUri,
      createdAt: Date.now(),
      expiresAt: Date.now() + (10 * 60 * 1000), // 10 minutes
    });

    // Build authorization URL
    const authUrl = new URL(metadata.authorization_endpoint);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('code_challenge', codeChallenge);
    authUrl.searchParams.set('code_challenge_method', 'S256');
    
    if (options.scopes?.length > 0) {
      authUrl.searchParams.set('scope', options.scopes.join(' '));
    }

    logger.info(`Initiated OAuth flow for ${serverName}`, { 
      authorizationUrl: authUrl.toString(),
      redirectUri,
      state 
    });

    return {
      authorizationUrl: authUrl.toString(),
      state,
      expiresIn: 600, // 10 minutes
    };
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code, state) {
    const pending = this.pendingAuthorizations.get(state);
    
    if (!pending) {
      throw new Error('Invalid or expired state parameter');
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingAuthorizations.delete(state);
      throw new Error('Authorization request has expired');
    }

    try {
      const metadata = await this.discoverServerMetadata(pending.serverUrl);
      
      // Exchange code for tokens - use the same redirect_uri that was used in auth request
      const tokenRequest = {
        grant_type: 'authorization_code',
        code,
        redirect_uri: pending.redirectUri || this.getCallbackUrl(),
        client_id: pending.clientId,
        code_verifier: pending.codeVerifier,
      };

      // Add client secret if available (confidential client)
      if (pending.clientSecret) {
        tokenRequest.client_secret = pending.clientSecret;
      }

      const response = await fetch(metadata.token_endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams(tokenRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${errorText}`);
      }

      const tokens = await response.json();

      // Store tokens
      this.storeTokens(pending.serverName, {
        ...tokens,
        serverUrl: pending.serverUrl,
        clientId: pending.clientId,
        clientSecret: pending.clientSecret,
        obtainedAt: Date.now(),
        expiresAt: tokens.expires_in 
          ? Date.now() + (tokens.expires_in * 1000) 
          : null,
      });

      // Clean up pending authorization
      this.pendingAuthorizations.delete(state);

      logger.info(`OAuth tokens obtained for ${pending.serverName}`);

      return {
        serverName: pending.serverName,
        success: true,
      };

    } catch (error) {
      this.pendingAuthorizations.delete(state);
      logger.error(`OAuth callback error:`, error);
      throw error;
    }
  }

  /**
   * Client Credentials Grant for server-to-server authentication
   */
  async clientCredentialsGrant(serverName, serverUrl, clientId, clientSecret, scopes = []) {
    const metadata = await this.discoverServerMetadata(serverUrl);

    const tokenRequest = {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    };

    if (scopes.length > 0) {
      tokenRequest.scope = scopes.join(' ');
    }

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams(tokenRequest),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Client credentials grant failed: ${errorText}`);
    }

    const tokens = await response.json();

    // Store tokens
    this.storeTokens(serverName, {
      ...tokens,
      serverUrl,
      clientId,
      clientSecret,
      grantType: 'client_credentials',
      obtainedAt: Date.now(),
      expiresAt: tokens.expires_in 
        ? Date.now() + (tokens.expires_in * 1000) 
        : null,
    });

    logger.info(`Client credentials tokens obtained for ${serverName}`);

    return tokens;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(serverName) {
    const tokenData = this.tokens.get(serverName);
    
    if (!tokenData || !tokenData.refresh_token) {
      throw new Error(`No refresh token available for ${serverName}`);
    }

    const metadata = await this.discoverServerMetadata(tokenData.serverUrl);

    const tokenRequest = {
      grant_type: 'refresh_token',
      refresh_token: tokenData.refresh_token,
      client_id: tokenData.clientId,
    };

    if (tokenData.clientSecret) {
      tokenRequest.client_secret = tokenData.clientSecret;
    }

    const response = await fetch(metadata.token_endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams(tokenRequest),
    });

    if (!response.ok) {
      // Clear stored tokens on refresh failure
      this.tokens.delete(serverName);
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    const newTokens = await response.json();

    // Update stored tokens
    this.storeTokens(serverName, {
      ...tokenData,
      ...newTokens,
      obtainedAt: Date.now(),
      expiresAt: newTokens.expires_in 
        ? Date.now() + (newTokens.expires_in * 1000) 
        : null,
    });

    logger.info(`Access token refreshed for ${serverName}`);

    return newTokens;
  }

  /**
   * Store tokens for a server
   */
  storeTokens(serverName, tokenData) {
    this.tokens.set(serverName, tokenData);
  }

  /**
   * Get access token for a server, refreshing if needed
   */
  async getAccessToken(serverName) {
    const tokenData = this.tokens.get(serverName);
    
    if (!tokenData) {
      return null;
    }

    // Check if token is expired or about to expire (5 minute buffer)
    if (tokenData.expiresAt && Date.now() > (tokenData.expiresAt - 5 * 60 * 1000)) {
      if (tokenData.refresh_token) {
        try {
          await this.refreshAccessToken(serverName);
          return this.tokens.get(serverName)?.access_token;
        } catch (error) {
          logger.error(`Failed to refresh token for ${serverName}:`, error);
          return null;
        }
      }
      // Token expired and no refresh token
      this.tokens.delete(serverName);
      return null;
    }

    return tokenData.access_token;
  }

  /**
   * Check if server has valid tokens
   */
  hasValidTokens(serverName) {
    const tokenData = this.tokens.get(serverName);
    if (!tokenData) return false;
    
    if (tokenData.expiresAt && Date.now() > tokenData.expiresAt) {
      return tokenData.refresh_token != null;
    }
    
    return true;
  }

  /**
   * Get token status for a server
   */
  getTokenStatus(serverName) {
    const tokenData = this.tokens.get(serverName);
    
    if (!tokenData) {
      return { authenticated: false };
    }

    const isExpired = tokenData.expiresAt && Date.now() > tokenData.expiresAt;
    const canRefresh = !!tokenData.refresh_token;

    return {
      authenticated: !isExpired || canRefresh,
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: canRefresh,
      isExpired,
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt).toISOString() : null,
      grantType: tokenData.grantType || 'authorization_code',
    };
  }

  /**
   * Revoke tokens for a server
   */
  async revokeTokens(serverName) {
    const tokenData = this.tokens.get(serverName);
    
    if (tokenData) {
      // Attempt to revoke at the OAuth server if endpoint is available
      try {
        const metadata = this.serverMetadata.get(tokenData.serverUrl);
        if (metadata?.revocation_endpoint) {
          await fetch(metadata.revocation_endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              token: tokenData.access_token,
              client_id: tokenData.clientId,
            }),
          });
        }
      } catch (error) {
        logger.warn(`Failed to revoke token at server:`, error);
      }
    }

    this.tokens.delete(serverName);
    logger.info(`Tokens revoked for ${serverName}`);
  }

  /**
   * Clean up expired pending authorizations
   */
  cleanupExpiredAuthorizations() {
    const now = Date.now();
    for (const [state, data] of this.pendingAuthorizations) {
      if (now > data.expiresAt) {
        this.pendingAuthorizations.delete(state);
      }
    }
  }

  /**
   * Get pending authorization by state
   */
  getPendingAuthorization(state) {
    return this.pendingAuthorizations.get(state);
  }
}

// Singleton instance
export const oauthManager = new OAuthManager();
