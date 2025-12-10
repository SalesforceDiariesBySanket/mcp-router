import { Router } from 'express';

export const healthRouter = Router();

/**
 * Health check endpoint
 * Used by Heroku and load balancers to verify the service is running
 */
healthRouter.get('/', (req, res) => {
  const connectionManager = req.app.get('mcpConnectionManager');
  const servers = connectionManager?.listServers() || [];
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    servers: {
      registered: servers.length,
      connected: servers.filter(s => s.connected).length,
    },
  });
});

/**
 * Detailed health check
 */
healthRouter.get('/detailed', (req, res) => {
  const connectionManager = req.app.get('mcpConnectionManager');
  const servers = connectionManager?.listServers() || [];
  
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    servers: servers.map(s => ({
      name: s.name,
      url: s.url,
      transport: s.transport,
      connected: s.connected,
    })),
  });
});
