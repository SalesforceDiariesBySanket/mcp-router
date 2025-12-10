import { Router } from 'express';
import { logger } from '../utils/logger.js';
import { oauthManager } from '../services/OAuthManager.js';

export const oauthRouter = Router();

/**
 * OAuth callback endpoint
 * Handles the redirect from OAuth authorization servers
 * 
 * This endpoint does NOT require API authentication because it's called
 * directly by the OAuth authorization server during the callback flow.
 */
oauthRouter.get('/callback', async (req, res) => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      logger.error('OAuth authorization error:', { error, error_description });
      
      // Render error page or redirect
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authorization Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   display: flex; justify-content: center; align-items: center; min-height: 100vh; 
                   margin: 0; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
            h1 { color: #e74c3c; margin-bottom: 20px; }
            p { color: #666; margin-bottom: 20px; }
            .error-code { background: #f8f8f8; padding: 10px; border-radius: 4px; 
                         font-family: monospace; word-break: break-all; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Authorization Failed</h1>
            <p>${error_description || error || 'Unknown error occurred'}</p>
            <div class="error-code">Error: ${error}</div>
            <p style="margin-top: 20px; font-size: 14px;">You can close this window.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Validate required parameters
    if (!code || !state) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invalid Request</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                   display: flex; justify-content: center; align-items: center; min-height: 100vh; 
                   margin: 0; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; 
                        box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
            h1 { color: #e74c3c; margin-bottom: 20px; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Invalid Request</h1>
            <p>Missing authorization code or state parameter.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Exchange code for tokens
    const result = await oauthManager.handleCallback(code, state);

    logger.info('OAuth authorization completed successfully', { serverName: result.serverName });

    // Render success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                 display: flex; justify-content: center; align-items: center; min-height: 100vh; 
                 margin: 0; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; 
                      box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          h1 { color: #27ae60; margin-bottom: 20px; }
          p { color: #666; margin-bottom: 20px; }
          .server-name { background: #e8f5e9; padding: 10px 20px; border-radius: 4px; 
                        font-weight: bold; color: #2e7d32; display: inline-block; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✅ Authorization Successful</h1>
          <p>Successfully connected to MCP server:</p>
          <div class="server-name">${result.serverName}</div>
          <p style="margin-top: 20px; font-size: 14px;">You can close this window and return to your application.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    logger.error('OAuth callback error:', error);

    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
                 display: flex; justify-content: center; align-items: center; min-height: 100vh; 
                 margin: 0; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; 
                      box-shadow: 0 2px 10px rgba(0,0,0,0.1); text-align: center; max-width: 400px; }
          h1 { color: #e74c3c; margin-bottom: 20px; }
          p { color: #666; }
          .error { background: #ffebee; padding: 10px; border-radius: 4px; color: #c62828; 
                  font-family: monospace; font-size: 12px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>⚠️ Authorization Error</h1>
          <p>An error occurred during authorization:</p>
          <div class="error">${error.message}</div>
          <p style="margin-top: 20px; font-size: 14px;">Please try again.</p>
        </div>
      </body>
      </html>
    `);
  }
});

/**
 * Get pending authorization status
 */
oauthRouter.get('/status/:state', (req, res) => {
  const { state } = req.params;
  const pending = oauthManager.getPendingAuthorization(state);

  if (!pending) {
    return res.status(404).json({
      success: false,
      error: 'Not Found',
      message: 'No pending authorization found for this state',
    });
  }

  const isExpired = Date.now() > pending.expiresAt;

  res.json({
    success: true,
    serverName: pending.serverName,
    status: isExpired ? 'expired' : 'pending',
    expiresAt: new Date(pending.expiresAt).toISOString(),
  });
});

/**
 * Initiate OAuth flow for a server (requires auth)
 */
oauthRouter.post('/initiate/:serverName', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const { clientId, clientSecret, scopes, clientMetadata } = req.body;
    
    const connectionManager = req.app.get('mcpConnectionManager');
    
    // Check if server is registered
    const status = connectionManager.getServerStatus(serverName);
    if (!status) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }

    // Initiate OAuth flow
    const result = await connectionManager.initiateOAuthFlow(serverName, {
      clientId,
      clientSecret,
      scopes,
      clientMetadata,
    });

    res.json({
      success: true,
      message: 'OAuth authorization required. Redirect user to authorizationUrl.',
      authorizationUrl: result.authorizationUrl,
      state: result.state,
      expiresIn: result.expiresIn,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Get OAuth status for a server
 */
oauthRouter.get('/token-status/:serverName', (req, res) => {
  const { serverName } = req.params;
  const connectionManager = req.app.get('mcpConnectionManager');
  
  const serverStatus = connectionManager.getServerStatus(serverName);
  if (!serverStatus) {
    return res.status(404).json({
      success: false,
      error: 'Server not found',
      message: `MCP server '${serverName}' is not registered`,
    });
  }

  const oauthStatus = connectionManager.getOAuthStatus(serverName);

  res.json({
    success: true,
    serverName,
    oauth: oauthStatus,
    requiresAuthorization: connectionManager.requiresOAuthAuthorization(serverName),
  });
});

/**
 * Revoke OAuth tokens for a server
 */
oauthRouter.post('/revoke/:serverName', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const connectionManager = req.app.get('mcpConnectionManager');
    
    const serverStatus = connectionManager.getServerStatus(serverName);
    if (!serverStatus) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }

    await connectionManager.revokeOAuthTokens(serverName);

    res.json({
      success: true,
      message: `OAuth tokens revoked for '${serverName}'`,
    });

  } catch (error) {
    next(error);
  }
});

/**
 * Perform client credentials grant
 */
oauthRouter.post('/client-credentials/:serverName', async (req, res, next) => {
  try {
    const { serverName } = req.params;
    const connectionManager = req.app.get('mcpConnectionManager');
    
    const serverStatus = connectionManager.getServerStatus(serverName);
    if (!serverStatus) {
      return res.status(404).json({
        success: false,
        error: 'Server not found',
        message: `MCP server '${serverName}' is not registered`,
      });
    }

    const tokens = await connectionManager.performClientCredentialsGrant(serverName);

    res.json({
      success: true,
      message: `Client credentials grant completed for '${serverName}'`,
      expiresIn: tokens.expires_in,
      tokenType: tokens.token_type,
      scope: tokens.scope,
    });

  } catch (error) {
    next(error);
  }
});
