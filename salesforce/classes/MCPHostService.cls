/**
 * Salesforce Apex service class for interacting with the Heroku MCP Host
 * 
 * This class provides methods to:
 * - List available MCP tools
 * - Call MCP tools with arguments
 * - List and read MCP resources
 * - List and get MCP prompts
 * 
 * Prerequisites:
 * 1. Add the Heroku app URL to Remote Site Settings
 * 2. Store the API key in a Named Credential or Custom Setting
 * 
 * @author Your Name
 * @version 1.0
 */
public class MCPHostService {
    
    // Configuration - Replace with your actual values or use Custom Settings/Named Credentials
    private static final String MCP_HOST_URL = 'https://your-heroku-app.herokuapp.com';
    private static final String API_KEY = 'your-api-key'; // Consider using Named Credential instead
    
    /**
     * Exception class for MCP-related errors
     */
    public class MCPException extends Exception {}
    
    /**
     * Response wrapper class
     */
    public class MCPResponse {
        public Boolean success;
        public Object result;
        public String error;
        public String message;
    }
    
    /**
     * Tool definition from MCP server
     */
    public class MCPTool {
        public String name;
        public String description;
        public Map<String, Object> inputSchema;
    }
    
    /**
     * Resource definition from MCP server
     */
    public class MCPResource {
        public String uri;
        public String name;
        public String description;
        public String mimeType;
    }
    
    /**
     * Prompt definition from MCP server
     */
    public class MCPPrompt {
        public String name;
        public String description;
        public List<Map<String, Object>> arguments;
    }
    
    // ==================== TOOLS ====================
    
    /**
     * List all available tools from an MCP server
     * 
     * @param serverName The name of the MCP server
     * @return List of tools available on the server
     */
    public static List<Object> listTools(String serverName) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/tools';
        
        HttpResponse response = sendRequest('GET', endpoint, null);
        Map<String, Object> result = parseResponse(response);
        
        return (List<Object>) result.get('tools');
    }
    
    /**
     * Call a tool on an MCP server
     * 
     * @param serverName The name of the MCP server
     * @param toolName The name of the tool to call
     * @param arguments Map of arguments to pass to the tool
     * @return The result from the tool execution
     */
    public static Map<String, Object> callTool(String serverName, String toolName, Map<String, Object> arguments) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/tools/call';
        
        Map<String, Object> body = new Map<String, Object>{
            'tool' => toolName,
            'arguments' => arguments != null ? arguments : new Map<String, Object>()
        };
        
        HttpResponse response = sendRequest('POST', endpoint, JSON.serialize(body));
        Map<String, Object> result = parseResponse(response);
        
        return (Map<String, Object>) result.get('result');
    }
    
    /**
     * Call a tool with no arguments
     * 
     * @param serverName The name of the MCP server
     * @param toolName The name of the tool to call
     * @return The result from the tool execution
     */
    public static Map<String, Object> callTool(String serverName, String toolName) {
        return callTool(serverName, toolName, null);
    }
    
    // ==================== RESOURCES ====================
    
    /**
     * List all available resources from an MCP server
     * 
     * @param serverName The name of the MCP server
     * @return List of resources available on the server
     */
    public static List<Object> listResources(String serverName) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/resources';
        
        HttpResponse response = sendRequest('GET', endpoint, null);
        Map<String, Object> result = parseResponse(response);
        
        return (List<Object>) result.get('resources');
    }
    
    /**
     * Read a resource from an MCP server
     * 
     * @param serverName The name of the MCP server
     * @param uri The URI of the resource to read
     * @return The resource content
     */
    public static Map<String, Object> readResource(String serverName, String uri) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/resources/read';
        
        Map<String, Object> body = new Map<String, Object>{
            'uri' => uri
        };
        
        HttpResponse response = sendRequest('POST', endpoint, JSON.serialize(body));
        Map<String, Object> result = parseResponse(response);
        
        return (Map<String, Object>) result.get('result');
    }
    
    // ==================== PROMPTS ====================
    
    /**
     * List all available prompts from an MCP server
     * 
     * @param serverName The name of the MCP server
     * @return List of prompts available on the server
     */
    public static List<Object> listPrompts(String serverName) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/prompts';
        
        HttpResponse response = sendRequest('GET', endpoint, null);
        Map<String, Object> result = parseResponse(response);
        
        return (List<Object>) result.get('prompts');
    }
    
    /**
     * Get a prompt from an MCP server
     * 
     * @param serverName The name of the MCP server
     * @param promptName The name of the prompt to get
     * @param arguments Map of arguments to pass to the prompt
     * @return The prompt result
     */
    public static Map<String, Object> getPrompt(String serverName, String promptName, Map<String, Object> arguments) {
        String endpoint = MCP_HOST_URL + '/api/v1/mcp/' + EncodingUtil.urlEncode(serverName, 'UTF-8') + '/prompts/get';
        
        Map<String, Object> body = new Map<String, Object>{
            'prompt' => promptName,
            'arguments' => arguments != null ? arguments : new Map<String, Object>()
        };
        
        HttpResponse response = sendRequest('POST', endpoint, JSON.serialize(body));
        Map<String, Object> result = parseResponse(response);
        
        return (Map<String, Object>) result.get('result');
    }
    
    // ==================== SERVER MANAGEMENT ====================
    
    /**
     * List all registered MCP servers
     * 
     * @return List of servers
     */
    public static List<Object> listServers() {
        String endpoint = MCP_HOST_URL + '/api/v1/servers';
        
        HttpResponse response = sendRequest('GET', endpoint, null);
        Map<String, Object> result = parseResponse(response);
        
        return (List<Object>) result.get('servers');
    }
    
    /**
     * Get status of a specific server
     * 
     * @param serverName The name of the MCP server
     * @return Server status information
     */
    public static Map<String, Object> getServerStatus(String serverName) {
        String endpoint = MCP_HOST_URL + '/api/v1/servers/' + EncodingUtil.urlEncode(serverName, 'UTF-8');
        
        HttpResponse response = sendRequest('GET', endpoint, null);
        Map<String, Object> result = parseResponse(response);
        
        return (Map<String, Object>) result.get('server');
    }
    
    /**
     * Register a new MCP server
     * 
     * @param name Server name
     * @param url Server URL
     * @param transport Transport type (sse or streamablehttp)
     * @return Registration result
     */
    public static Map<String, Object> registerServer(String name, String url, String transport) {
        String endpoint = MCP_HOST_URL + '/api/v1/servers';
        
        Map<String, Object> body = new Map<String, Object>{
            'name' => name,
            'url' => url,
            'transport' => transport != null ? transport : 'sse'
        };
        
        HttpResponse response = sendRequest('POST', endpoint, JSON.serialize(body));
        return parseResponse(response);
    }
    
    // ==================== UTILITY METHODS ====================
    
    /**
     * Send HTTP request to the MCP Host
     */
    private static HttpResponse sendRequest(String method, String endpoint, String body) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod(method);
        req.setHeader('X-API-Key', API_KEY);
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(60000); // 60 second timeout
        
        if (body != null && method != 'GET') {
            req.setBody(body);
        }
        
        Http http = new Http();
        return http.send(req);
    }
    
    /**
     * Parse HTTP response
     */
    private static Map<String, Object> parseResponse(HttpResponse response) {
        Integer statusCode = response.getStatusCode();
        String responseBody = response.getBody();
        
        Map<String, Object> result;
        try {
            result = (Map<String, Object>) JSON.deserializeUntyped(responseBody);
        } catch (Exception e) {
            throw new MCPException('Failed to parse response: ' + e.getMessage());
        }
        
        if (statusCode >= 200 && statusCode < 300) {
            if (result.get('success') == true) {
                return result;
            }
        }
        
        String errorMessage = (String) result.get('message');
        if (errorMessage == null) {
            errorMessage = (String) result.get('error');
        }
        if (errorMessage == null) {
            errorMessage = 'HTTP ' + statusCode + ': Unknown error';
        }
        
        throw new MCPException(errorMessage);
    }
}
