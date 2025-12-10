# Deployment Guide

This guide covers deploying the Heroku MCP Host to Heroku.

## Quick Deploy

Click the button below to deploy to Heroku:

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

## Manual Deployment

### Prerequisites

1. [Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli) installed
2. A Heroku account
3. Git installed

### Steps

1. **Clone or download the repository**

   ```bash
   cd heroku-mcp-host
   ```

2. **Login to Heroku**

   ```bash
   heroku login
   ```

3. **Create a new Heroku app**

   ```bash
   heroku create your-app-name
   ```

4. **Set environment variables**

   ```bash
   # Required: API key for authentication
   heroku config:set API_KEY=your-secure-api-key-here

   # Optional: Configure MCP servers
   heroku config:set MCP_SERVERS='{"myserver": {"url": "https://mcp-server.example.com/sse", "transport": "sse"}}'

   # Optional: Set timeout
   heroku config:set MCP_TIMEOUT=30000

   # Optional: Set log level
   heroku config:set LOG_LEVEL=info
   ```

5. **Deploy**

   ```bash
   git push heroku main
   ```

6. **Verify deployment**

   ```bash
   heroku open
   ```

   Or check the health endpoint:

   ```bash
   curl https://your-app-name.herokuapp.com/health
   ```

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `API_KEY` | Yes | - | API key for authenticating requests |
| `MCP_SERVERS` | No | `{}` | JSON configuration for MCP servers |
| `MCP_TIMEOUT` | No | `30000` | Timeout for MCP operations (ms) |
| `LOG_LEVEL` | No | `info` | Logging level |
| `CORS_ORIGINS` | No | `*` | Allowed CORS origins |
| `PORT` | No | (auto) | Port to listen on (set by Heroku) |

## Configuring MCP Servers

### Via Environment Variable

Set the `MCP_SERVERS` environment variable with a JSON object:

```bash
heroku config:set MCP_SERVERS='{
  "fetch": {
    "url": "https://my-fetch-server.herokuapp.com/sse",
    "transport": "sse"
  },
  "database": {
    "url": "https://my-db-server.herokuapp.com/sse",
    "transport": "sse",
    "headers": {
      "Authorization": "Bearer secret-token"
    }
  }
}'
```

### Via API

You can also add servers dynamically using the REST API:

```bash
curl -X POST https://your-app-name.herokuapp.com/api/v1/servers \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "name": "newserver",
    "url": "https://new-mcp-server.herokuapp.com/sse",
    "transport": "sse"
  }'
```

## Scaling

### Horizontal Scaling

```bash
heroku ps:scale web=2
```

### Dyno Types

For production workloads:

```bash
heroku ps:type web=standard-1x
```

## Monitoring

### View Logs

```bash
heroku logs --tail
```

### Add-ons

Consider adding these Heroku add-ons:

- **Papertrail**: Log management
- **New Relic**: Application performance monitoring

```bash
heroku addons:create papertrail
heroku addons:create newrelic
```

## Security Best Practices

1. **Use Strong API Keys**: Generate a secure, random API key

   ```bash
   openssl rand -hex 32
   ```

2. **Rotate API Keys**: Periodically update the API key

   ```bash
   heroku config:set API_KEY=new-secure-key
   ```

3. **Restrict CORS**: In production, limit CORS to your Salesforce org domain

   ```bash
   heroku config:set CORS_ORIGINS=https://yourorg.my.salesforce.com
   ```

4. **Use HTTPS**: Heroku provides HTTPS by default

5. **Monitor Access**: Review logs for suspicious activity

## Troubleshooting

### App Crashes

Check logs:
```bash
heroku logs --tail
```

Common causes:
- Invalid `MCP_SERVERS` JSON format
- Missing required environment variables
- Memory limits exceeded

### Connection Timeouts

- Increase `MCP_TIMEOUT`:
  ```bash
  heroku config:set MCP_TIMEOUT=60000
  ```
- Check if MCP server is accessible from Heroku
- Verify network/firewall settings

### Authentication Failures

- Verify API key is correct in both Heroku and Salesforce
- Check the Authorization header format
- Review logs for detailed error messages

## Updating

To update the application:

```bash
git pull origin main  # Get latest changes
git push heroku main  # Deploy to Heroku
```

## Rollback

If something goes wrong:

```bash
heroku releases                    # List releases
heroku rollback v10                # Rollback to version 10
```
