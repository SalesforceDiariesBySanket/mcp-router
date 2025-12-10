# Connecting to Remote MCP Servers

This guide explains how to configure and connect to remote MCP servers like Atlassian's Remote MCP Server.

## Atlassian MCP Server

The Atlassian MCP Server provides access to Jira and Confluence data through the Model Context Protocol.

### Architecture

1. Client connects to: `https://mcp.atlassian.com/v1/sse`
2. OAuth 2.0 flow is triggered in the browser
3. Once authorized, the client can stream data and receive responses

### Configuration

Add Atlassian as an MCP server using the environment variable or API:

#### Environment Variable Configuration

```bash
MCP_SERVERS='{
  "atlassian": {
    "url": "https://mcp.atlassian.com/v1/sse",
    "transport": "sse",
    "authType": "oauth2",
    "oauth": {
      "clientId": "YOUR_ATLASSIAN_CLIENT_ID",
      "scopes": ["read:jira-work", "read:confluence-content.all"]
    }
  }
}'
```

#### API Configuration

```http
POST /api/v1/servers
Content-Type: application/json
X-API-Key: your-api-key

{
  "name": "atlassian",
  "url": "https://mcp.atlassian.com/v1/sse",
  "transport": "sse",
  "authType": "oauth2",
  "oauth": {
    "clientId": "YOUR_ATLASSIAN_CLIENT_ID",
    "scopes": ["read:jira-work", "read:confluence-content.all"]
  }
}
```

### OAuth Flow

1. **First Connection**: When you first try to use the Atlassian server, you'll receive a 401 response with an `authorizationUrl`
2. **Browser Authorization**: Open the `authorizationUrl` in a browser and log in with your Atlassian credentials
3. **Callback**: After authorization, Atlassian redirects to your callback URL (`/oauth/callback`)
4. **Token Storage**: Tokens are stored securely and used for subsequent requests

### Example Workflow

1. Register the server:
```bash
curl -X POST https://your-heroku-app.herokuapp.com/api/v1/servers \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"name": "atlassian", "url": "https://mcp.atlassian.com/v1/sse", "authType": "oauth2"}'
```

2. Try to list tools (will return OAuth authorization required):
```bash
curl https://your-heroku-app.herokuapp.com/api/v1/mcp/atlassian/tools \
  -H "X-API-Key: your-api-key"
```

3. Response includes `authorizationUrl` - open this in browser

4. After authorization, retry the tools request:
```bash
curl https://your-heroku-app.herokuapp.com/api/v1/mcp/atlassian/tools \
  -H "X-API-Key: your-api-key"
```

### Available Tools (Example)

Once connected, Atlassian MCP Server provides tools like:

- **Jira**: Search issues, create issues, update issues
- **Confluence**: Search pages, create pages, get space information

### Permission Management

- Access is limited to data the authenticated user can view in Atlassian Cloud
- All actions respect existing project/space-level roles
- OAuth tokens are scoped and session-based

## Other Remote MCP Servers

### Generic Remote Server Configuration

```json
{
  "name": "remote-server",
  "url": "https://mcp.example.com/sse",
  "transport": "sse",
  "authType": "oauth2",
  "oauth": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "scopes": ["scope1", "scope2"],
    "metadataUrl": "https://auth.example.com/.well-known/oauth-authorization-server"
  }
}
```

### Transport Types

| Type | Description |
|------|-------------|
| `sse` | Server-Sent Events (default, recommended) |
| `streamable-http` | MCP 2025-03-26 Streamable HTTP |
| `http-sse` | Legacy HTTP+SSE transport |

### Authentication Types

| Type | Description |
|------|-------------|
| `none` | No authentication (will probe for OAuth if server returns 401) |
| `api-key` | API key in X-API-Key header |
| `bearer-token` | Bearer token in Authorization header |
| `oauth2` | OAuth 2.0 Authorization Code flow with PKCE |
| `oauth2-client-credentials` | OAuth 2.0 Client Credentials grant |

## Troubleshooting

### OAuth Discovery Fails

If OAuth metadata discovery fails, provide the endpoints explicitly:

```json
{
  "oauth": {
    "metadataUrl": "https://auth.example.com/.well-known/oauth-authorization-server"
  }
}
```

### Connection Timeouts

Increase the timeout in configuration:

```json
{
  "timeout": 60000
}
```

### Token Refresh Issues

If tokens aren't refreshing properly, revoke and re-authorize:

```bash
curl -X DELETE https://your-heroku-app.herokuapp.com/api/v1/oauth/atlassian/revoke \
  -H "X-API-Key: your-api-key"
```

Then reconnect to trigger a fresh OAuth flow.
