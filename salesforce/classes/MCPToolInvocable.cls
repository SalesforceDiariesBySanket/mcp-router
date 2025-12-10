/**
 * Invocable Apex class for calling MCP tools from Salesforce Flow
 * 
 * This class provides a Flow-accessible action to call MCP tools
 * through the Heroku MCP Host.
 * 
 * Usage in Flow:
 * 1. Add an "Apex Action" element
 * 2. Select "Call MCP Tool"
 * 3. Provide Server Name, Tool Name, and optionally Arguments (as JSON string)
 * 
 * @author Your Name
 * @version 1.0
 */
public class MCPToolInvocable {
    
    /**
     * Input class for the invocable method
     */
    public class ToolCallInput {
        @InvocableVariable(label='MCP Server Name' description='Name of the registered MCP server' required=true)
        public String serverName;
        
        @InvocableVariable(label='Tool Name' description='Name of the MCP tool to call' required=true)
        public String toolName;
        
        @InvocableVariable(label='Arguments (JSON)' description='Tool arguments as a JSON string, e.g., {"param1": "value1"}')
        public String argumentsJson;
    }
    
    /**
     * Output class for the invocable method
     */
    public class ToolCallOutput {
        @InvocableVariable(label='Success' description='Whether the tool call was successful')
        public Boolean success;
        
        @InvocableVariable(label='Result (JSON)' description='The tool result as a JSON string')
        public String resultJson;
        
        @InvocableVariable(label='Error Message' description='Error message if the call failed')
        public String errorMessage;
        
        @InvocableVariable(label='Content Text' description='Extracted text content from the result (if available)')
        public String contentText;
    }
    
    /**
     * Invocable method to call an MCP tool
     * 
     * @param inputs List of ToolCallInput objects
     * @return List of ToolCallOutput objects with results
     */
    @InvocableMethod(
        label='Call MCP Tool'
        description='Calls a tool on a remote MCP server via the Heroku MCP Host'
        category='MCP Integration'
    )
    public static List<ToolCallOutput> callTool(List<ToolCallInput> inputs) {
        List<ToolCallOutput> outputs = new List<ToolCallOutput>();
        
        for (ToolCallInput input : inputs) {
            ToolCallOutput output = new ToolCallOutput();
            
            try {
                // Parse arguments if provided
                Map<String, Object> arguments = new Map<String, Object>();
                if (String.isNotBlank(input.argumentsJson)) {
                    arguments = (Map<String, Object>) JSON.deserializeUntyped(input.argumentsJson);
                }
                
                // Call the tool
                Map<String, Object> result = MCPHostService.callTool(
                    input.serverName,
                    input.toolName,
                    arguments
                );
                
                output.success = true;
                output.resultJson = JSON.serialize(result);
                
                // Try to extract text content from the result
                output.contentText = extractTextContent(result);
                
            } catch (Exception e) {
                output.success = false;
                output.errorMessage = e.getMessage();
            }
            
            outputs.add(output);
        }
        
        return outputs;
    }
    
    /**
     * Helper method to extract text content from MCP result
     * MCP tool results often have a 'content' array with text items
     */
    private static String extractTextContent(Map<String, Object> result) {
        try {
            if (result == null) return null;
            
            // Check for 'content' array (standard MCP format)
            Object contentObj = result.get('content');
            if (contentObj instanceof List<Object>) {
                List<Object> contentList = (List<Object>) contentObj;
                List<String> textParts = new List<String>();
                
                for (Object item : contentList) {
                    if (item instanceof Map<String, Object>) {
                        Map<String, Object> contentItem = (Map<String, Object>) item;
                        String type = (String) contentItem.get('type');
                        
                        if (type == 'text') {
                            String text = (String) contentItem.get('text');
                            if (text != null) {
                                textParts.add(text);
                            }
                        }
                    }
                }
                
                if (!textParts.isEmpty()) {
                    return String.join(textParts, '\n');
                }
            }
            
            // Fallback: check for direct 'text' field
            if (result.containsKey('text')) {
                return (String) result.get('text');
            }
            
        } catch (Exception e) {
            // Ignore extraction errors
        }
        
        return null;
    }
}
