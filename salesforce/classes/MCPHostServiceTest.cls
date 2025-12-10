/**
 * Test class for MCPHostService
 * 
 * Note: These tests use mocks since we can't make actual HTTP callouts in tests.
 * In a real scenario, you would use HttpCalloutMock to simulate the MCP Host responses.
 */
@isTest
public class MCPHostServiceTest {
    
    /**
     * Mock class for simulating HTTP responses
     */
    private class MCPHostMock implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;
        
        public MCPHostMock(Integer statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }
        
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(this.statusCode);
            res.setBody(this.responseBody);
            res.setHeader('Content-Type', 'application/json');
            return res;
        }
    }
    
    @isTest
    static void testListTools() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "tools": [{"name": "test_tool", "description": "A test tool"}]}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        List<Object> tools = MCPHostService.listTools('test');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, tools);
        System.assertEquals(1, tools.size());
    }
    
    @isTest
    static void testCallTool() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "tool": "fetch", "result": {"content": [{"type": "text", "text": "Hello World"}]}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> args = new Map<String, Object>{'url' => 'https://example.com'};
        Map<String, Object> result = MCPHostService.callTool('test', 'fetch', args);
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, result);
    }
    
    @isTest
    static void testCallToolNoArgs() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "tool": "ping", "result": {"status": "ok"}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> result = MCPHostService.callTool('test', 'ping');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, result);
    }
    
    @isTest
    static void testListResources() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "resources": [{"uri": "resource://test", "name": "Test Resource"}]}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        List<Object> resources = MCPHostService.listResources('test');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, resources);
        System.assertEquals(1, resources.size());
    }
    
    @isTest
    static void testReadResource() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "uri": "resource://test", "result": {"contents": [{"text": "Resource content"}]}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> result = MCPHostService.readResource('test', 'resource://test');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, result);
    }
    
    @isTest
    static void testListPrompts() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "prompts": [{"name": "test_prompt", "description": "A test prompt"}]}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        List<Object> prompts = MCPHostService.listPrompts('test');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, prompts);
        System.assertEquals(1, prompts.size());
    }
    
    @isTest
    static void testGetPrompt() {
        // Setup mock
        String mockResponse = '{"success": true, "serverName": "test", "prompt": "greeting", "result": {"messages": [{"role": "user", "content": {"type": "text", "text": "Hello"}}]}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> args = new Map<String, Object>{'name' => 'World'};
        Map<String, Object> result = MCPHostService.getPrompt('test', 'greeting', args);
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, result);
    }
    
    @isTest
    static void testListServers() {
        // Setup mock
        String mockResponse = '{"success": true, "servers": [{"name": "test", "url": "https://example.com/sse", "connected": false}]}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        List<Object> servers = MCPHostService.listServers();
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, servers);
        System.assertEquals(1, servers.size());
    }
    
    @isTest
    static void testGetServerStatus() {
        // Setup mock
        String mockResponse = '{"success": true, "server": {"name": "test", "url": "https://example.com/sse", "connected": true}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(200, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> status = MCPHostService.getServerStatus('test');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, status);
        System.assertEquals('test', status.get('name'));
    }
    
    @isTest
    static void testRegisterServer() {
        // Setup mock
        String mockResponse = '{"success": true, "message": "Server registered", "server": {"name": "newserver", "url": "https://new.com/sse"}}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(201, mockResponse));
        
        // Call method
        Test.startTest();
        Map<String, Object> result = MCPHostService.registerServer('newserver', 'https://new.com/sse', 'sse');
        Test.stopTest();
        
        // Verify
        System.assertNotEquals(null, result);
        System.assertEquals(true, result.get('success'));
    }
    
    @isTest
    static void testErrorHandling() {
        // Setup mock for error response
        String mockResponse = '{"success": false, "error": "Server not found", "message": "MCP server \'unknown\' is not registered"}';
        Test.setMock(HttpCalloutMock.class, new MCPHostMock(404, mockResponse));
        
        // Call method and expect exception
        Test.startTest();
        try {
            MCPHostService.listTools('unknown');
            System.assert(false, 'Expected MCPException to be thrown');
        } catch (MCPHostService.MCPException e) {
            System.assert(e.getMessage().contains('not registered'));
        }
        Test.stopTest();
    }
}
