# Heroku MCP Host

A Node.js application that acts as an MCP (Model Context Protocol) Host, bridging Salesforce (Apex/Flow) with remote MCP servers via REST API.

## Overview

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Salesforce    │         │  Heroku MCP Host │         │  Remote MCP     │
│  (Apex / Flow)  │◄───────►│   (REST API)     │◄───────►│    Servers      │
│                 │  HTTPS  │                  │   SSE   │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
```

Since Salesforce cannot directly communicate with MCP servers (which use SSE/StreamableHTTP protocols), this application acts as a bridge by:

1. Exposing a REST API that Salesforce can call
2. Connecting to remote MCP servers using the MCP protocol
3. Translating REST requests to MCP commands and vice versa

## Features

- 🔌 Connect to multiple MCP servers simultaneously
- 🔧 Call MCP tools from Salesforce Apex/Flow
- 📚 Read MCP resources
- 💬 Get MCP prompts
- 🔐 API key authentication
- 📊 Health monitoring endpoints
- 🚀 Heroku-ready deployment

## Quick Start

### Local Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file:
   ```bash
   cp .env.example .env
   ```

4. Configure your MCP servers in `.env`:
   ```env
   API_KEY=your-secure-api-key
   MCP_SERVERS={"myserver": {"url": "https://mcp-server.example.com/sse", "transport": "sse"}}
   ```

5. Start the server:
   ```bash
   npm start
   ```

### Deploy to Heroku

1. Create a Heroku app:
   ```bash
   heroku create your-app-name
   ```

2. Set environment variables:
   ```bash
   heroku config:set API_KEY=your-secure-api-key
   heroku config:set MCP_SERVERS='{"myserver": {"url": "https://mcp-server.example.com/sse", "transport": "sse"}}'
   ```

3. Deploy:
   ```bash
   git push heroku main
   ```

## API Reference

### Authentication

All API endpoints (except `/health`) require authentication via:
- `X-API-Key` header, or
- `Authorization: Bearer <api-key>` header

### Endpoints

#### Health Check

```
GET /health
```

Returns server health status. No authentication required.

#### List Servers

```
GET /api/v1/servers
```

Returns list of registered MCP servers.

#### Register Server

```
POST /api/v1/servers
Content-Type: application/json

{
  "name": "myserver",
  "url": "https://mcp-server.example.com/sse",
  "transport": "sse",
  "headers": {},
  "timeout": 30000
}
```

#### List Tools

```
GET /api/v1/mcp/:serverName/tools
```

Returns list of available tools from the MCP server.

#### Call Tool

```
POST /api/v1/mcp/:serverName/tools/call
Content-Type: application/json

{
  "tool": "toolName",
  "arguments": {
    "arg1": "value1"
  }
}
```

Calls a tool on the MCP server and returns the result.

#### List Resources

```
GET /api/v1/mcp/:serverName/resources
```

#### Read Resource

```
POST /api/v1/mcp/:serverName/resources/read
Content-Type: application/json

{
  "uri": "resource://example/resource"
}
```

#### List Prompts

```
GET /api/v1/mcp/:serverName/prompts
```

#### Get Prompt

```
POST /api/v1/mcp/:serverName/prompts/get
Content-Type: application/json

{
  "prompt": "promptName",
  "arguments": {
    "arg1": "value1"
  }
}
```

## Salesforce Integration

### Apex Example

```apex
public class MCPHostService {
    private static final String MCP_HOST_URL = 'https://your-heroku-app.herokuapp.com';
    private static final String API_KEY = 'your-api-key';
    
    /**
     * Call an MCP tool
     */
    public static Map<String, Object> callTool(String serverName, String toolName, Map<String, Object> arguments) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(MCP_HOST_URL + '/api/v1/mcp/' + serverName + '/tools/call');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setHeader('X-API-Key', API_KEY);
        req.setTimeout(60000);
        
        Map<String, Object> body = new Map<String, Object>{
            'tool' => toolName,
            'arguments' => arguments
        };
        req.setBody(JSON.serialize(body));
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            return (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
        } else {
            throw new MCPException('MCP call failed: ' + res.getBody());
        }
    }
    
    /**
     * List available tools
     */
    public static List<Object> listTools(String serverName) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(MCP_HOST_URL + '/api/v1/mcp/' + serverName + '/tools');
        req.setMethod('GET');
        req.setHeader('X-API-Key', API_KEY);
        req.setTimeout(30000);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            return (List<Object>) result.get('tools');
        } else {
            throw new MCPException('Failed to list tools: ' + res.getBody());
        }
    }
    
    public class MCPException extends Exception {}
}
```

### Flow Integration

1. Create a Named Credential for the Heroku MCP Host URL
2. Use an Apex Action to call `MCPHostService.callTool()`
3. Parse the JSON response in Flow

### Remote Site Setting

Don't forget to add your Heroku app URL to Remote Site Settings in Salesforce Setup:
- Remote Site URL: `https://your-heroku-app.herokuapp.com`

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `HOST` | Bind host | `0.0.0.0` |
| `API_KEY` | API key for authentication | (required) |
| `LOG_LEVEL` | Logging level | `info` |
| `MCP_SERVERS` | JSON config for MCP servers | `{}` |
| `MCP_TIMEOUT` | Default timeout in ms | `30000` |
| `CORS_ORIGINS` | CORS allowed origins | `*` |

### MCP Server Configuration Format

```json
{
  "serverName": {
    "url": "https://mcp-server.example.com/sse",
    "transport": "sse",
    "headers": {
      "Authorization": "Bearer token"
    },
    "timeout": 30000
  }
}
```

## Security Considerations

1. **Always use HTTPS** in production
2. **Rotate API keys** regularly
3. **Limit CORS origins** to your Salesforce org domain
4. **Use Named Credentials** in Salesforce for credential storage
5. **Monitor logs** for suspicious activity

## Troubleshooting

### Connection Issues

- Verify the MCP server URL is accessible from Heroku
- Check if the MCP server requires authentication headers
- Review Heroku logs: `heroku logs --tail`

### Timeout Errors

- Increase `MCP_TIMEOUT` for slow operations
- Increase Apex `setTimeout()` to match

### Authentication Failures

- Verify API key is correctly set in both Heroku and Salesforce
- Check the Authorization header format

## License

MIT
