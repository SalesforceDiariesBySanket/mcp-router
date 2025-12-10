import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { logger } from '../utils/logger.js';

/**
 * MCP Client wrapper for connecting to remote MCP servers
 */
export class MCPClient {
  constructor(name, config) {
    this.name = name;
    this.config = config;
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.capabilities = null;
    this.serverInfo = null;
  }

  /**
   * Connect to the MCP server
   */
  async connect() {
    try {
      logger.info(`Connecting to MCP server: ${this.name}`, { url: this.config.url });

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

      // Create SSE transport
      const url = new URL(this.config.url);
      this.transport = new SSEClientTransport(url, {
        requestInit: {
          headers: this.config.headers || {},
        },
      });

      // Connect
      await this.client.connect(this.transport);
      
      this.connected = true;
      this.serverInfo = this.client.getServerVersion?.() || null;
      this.capabilities = this.client.getServerCapabilities?.() || null;

      logger.info(`Connected to MCP server: ${this.name}`, {
        serverInfo: this.serverInfo,
        capabilities: this.capabilities,
      });

    } catch (error) {
      logger.error(`Failed to connect to MCP server ${this.name}:`, error);
      this.connected = false;
      throw error;
    }
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
   * List available tools
   */
  async listTools() {
    this.ensureConnected();
    try {
      const result = await this.client.listTools();
      return result.tools || [];
    } catch (error) {
      logger.error(`Error listing tools from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * Call a tool
   */
  async callTool(toolName, args = {}) {
    this.ensureConnected();
    try {
      logger.info(`Calling tool: ${toolName}`, { server: this.name, args });
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });
      return result;
    } catch (error) {
      logger.error(`Error calling tool ${toolName} on ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * List available resources
   */
  async listResources() {
    this.ensureConnected();
    try {
      const result = await this.client.listResources();
      return result.resources || [];
    } catch (error) {
      logger.error(`Error listing resources from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * Read a resource
   */
  async readResource(uri) {
    this.ensureConnected();
    try {
      logger.info(`Reading resource: ${uri}`, { server: this.name });
      const result = await this.client.readResource({ uri });
      return result;
    } catch (error) {
      logger.error(`Error reading resource ${uri} from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * List resource templates
   */
  async listResourceTemplates() {
    this.ensureConnected();
    try {
      const result = await this.client.listResourceTemplates();
      return result.resourceTemplates || [];
    } catch (error) {
      logger.error(`Error listing resource templates from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * List available prompts
   */
  async listPrompts() {
    this.ensureConnected();
    try {
      const result = await this.client.listPrompts();
      return result.prompts || [];
    } catch (error) {
      logger.error(`Error listing prompts from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * Get a prompt
   */
  async getPrompt(promptName, args = {}) {
    this.ensureConnected();
    try {
      logger.info(`Getting prompt: ${promptName}`, { server: this.name, args });
      const result = await this.client.getPrompt({
        name: promptName,
        arguments: args,
      });
      return result;
    } catch (error) {
      logger.error(`Error getting prompt ${promptName} from ${this.name}:`, error);
      throw this.wrapError(error);
    }
  }

  /**
   * Ensure the client is connected
   */
  ensureConnected() {
    if (!this.isConnected()) {
      const error = new Error(`Not connected to MCP server: ${this.name}`);
      error.name = 'ConnectionError';
      throw error;
    }
  }

  /**
   * Wrap errors with appropriate type
   */
  wrapError(error) {
    if (error.name === 'ConnectionError' || error.name === 'MCPError') {
      return error;
    }
    const wrappedError = new Error(error.message);
    wrappedError.name = 'MCPError';
    wrappedError.code = error.code;
    wrappedError.originalError = error;
    return wrappedError;
  }
}
