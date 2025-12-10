# Salesforce Integration Examples

This document provides practical examples of integrating MCP tools with Salesforce using the Heroku MCP Host.

## Prerequisites

1. Deploy the Heroku MCP Host application
2. Configure at least one MCP server in your deployment
3. Add the Heroku app URL to Salesforce Remote Site Settings
4. Deploy the Apex classes from the `salesforce/classes` folder

## Example 1: Using the Fetch MCP Server

The `mcp-server-fetch` allows fetching web content. Here's how to use it from Salesforce.

### Configure the MCP Server

Set the `MCP_SERVERS` environment variable in Heroku:

```json
{
  "fetch": {
    "url": "https://your-fetch-mcp-server.herokuapp.com/sse",
    "transport": "sse"
  }
}
```

### Apex Usage

```apex
// Fetch content from a webpage
public static String fetchWebpage(String url) {
    Map<String, Object> args = new Map<String, Object>{
        'url' => url
    };
    
    Map<String, Object> result = MCPHostService.callTool('fetch', 'fetch', args);
    
    // Extract text content from result
    List<Object> content = (List<Object>) result.get('content');
    if (content != null && !content.isEmpty()) {
        Map<String, Object> firstContent = (Map<String, Object>) content[0];
        return (String) firstContent.get('text');
    }
    
    return null;
}
```

### Flow Usage

1. Create a new Flow
2. Add an "Apex Action" element
3. Select "Call MCP Tool"
4. Set inputs:
   - Server Name: `fetch`
   - Tool Name: `fetch`
   - Arguments (JSON): `{"url": "https://example.com"}`
5. Use the `contentText` output variable in your Flow

## Example 2: Using a Database Query MCP Server

If you have an MCP server that can query databases:

```apex
public static List<Map<String, Object>> queryExternalDatabase(String sqlQuery) {
    Map<String, Object> args = new Map<String, Object>{
        'query' => sqlQuery
    };
    
    Map<String, Object> result = MCPHostService.callTool('database', 'query', args);
    return (List<Map<String, Object>>) result.get('rows');
}
```

## Example 3: Trigger-Based Integration

Automatically call an MCP tool when a record is created:

```apex
trigger AccountAfterInsert on Account (after insert) {
    // Queue the MCP call to avoid callout in trigger context
    for (Account acc : Trigger.new) {
        System.enqueueJob(new MCPEnrichmentJob(acc.Id, acc.Website));
    }
}

public class MCPEnrichmentJob implements Queueable, Database.AllowsCallouts {
    private Id accountId;
    private String website;
    
    public MCPEnrichmentJob(Id accountId, String website) {
        this.accountId = accountId;
        this.website = website;
    }
    
    public void execute(QueueableContext context) {
        if (String.isBlank(website)) return;
        
        try {
            Map<String, Object> args = new Map<String, Object>{
                'url' => website
            };
            
            Map<String, Object> result = MCPHostService.callTool('fetch', 'fetch', args);
            
            // Process result and update account
            // ...
            
        } catch (Exception e) {
            System.debug('MCP enrichment failed: ' + e.getMessage());
        }
    }
}
```

## Example 4: Scheduled MCP Operations

Run MCP operations on a schedule:

```apex
public class MCPScheduledJob implements Schedulable {
    public void execute(SchedulableContext ctx) {
        // Queue the actual work
        System.enqueueJob(new MCPBatchProcessor());
    }
}

public class MCPBatchProcessor implements Queueable, Database.AllowsCallouts {
    public void execute(QueueableContext context) {
        // Get records to process
        List<Lead> leads = [SELECT Id, Website FROM Lead WHERE NeedsEnrichment__c = true LIMIT 10];
        
        for (Lead lead : leads) {
            try {
                Map<String, Object> args = new Map<String, Object>{'url' => lead.Website};
                Map<String, Object> result = MCPHostService.callTool('fetch', 'fetch', args);
                
                // Update lead with enrichment data
                // ...
            } catch (Exception e) {
                System.debug('Failed to enrich lead ' + lead.Id + ': ' + e.getMessage());
            }
        }
    }
}

// Schedule the job
// System.schedule('MCP Daily Enrichment', '0 0 2 * * ?', new MCPScheduledJob());
```

## Example 5: LWC Integration

Call MCP tools from Lightning Web Components via Apex:

```apex
public with sharing class MCPController {
    @AuraEnabled(cacheable=false)
    public static String callMCPTool(String serverName, String toolName, String argumentsJson) {
        try {
            Map<String, Object> args = String.isNotBlank(argumentsJson) 
                ? (Map<String, Object>) JSON.deserializeUntyped(argumentsJson)
                : new Map<String, Object>();
            
            Map<String, Object> result = MCPHostService.callTool(serverName, toolName, args);
            return JSON.serialize(result);
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static String listMCPTools(String serverName) {
        try {
            List<Object> tools = MCPHostService.listTools(serverName);
            return JSON.serialize(tools);
        } catch (Exception e) {
            throw new AuraHandledException(e.getMessage());
        }
    }
}
```

## Error Handling Best Practices

```apex
public static void safeCallTool(String server, String tool, Map<String, Object> args) {
    try {
        Map<String, Object> result = MCPHostService.callTool(server, tool, args);
        
        // Check for error in result
        if (result.containsKey('isError') && (Boolean) result.get('isError')) {
            handleMCPError(result);
        }
        
        // Process successful result
        processResult(result);
        
    } catch (MCPHostService.MCPException e) {
        // Handle MCP-specific errors
        System.debug(LoggingLevel.ERROR, 'MCP Error: ' + e.getMessage());
        
        // Log to custom object or platform event for monitoring
        insert new Error_Log__c(
            Type__c = 'MCP Integration',
            Message__c = e.getMessage(),
            Server__c = server,
            Tool__c = tool
        );
        
    } catch (System.CalloutException e) {
        // Handle network/timeout errors
        System.debug(LoggingLevel.ERROR, 'Callout Error: ' + e.getMessage());
        
    } catch (Exception e) {
        // Handle unexpected errors
        System.debug(LoggingLevel.ERROR, 'Unexpected Error: ' + e.getMessage());
    }
}
```

## Rate Limiting Considerations

When calling MCP tools from Salesforce, consider:

1. **Apex Callout Limits**: Max 100 callouts per transaction
2. **Timeout Limits**: Max 120 seconds per callout, 120 seconds total per transaction
3. **Queueable Chaining**: Use for processing many records

```apex
public class MCPBatchChainProcessor implements Queueable, Database.AllowsCallouts {
    private List<Id> recordIds;
    private Integer batchSize = 10;
    
    public MCPBatchChainProcessor(List<Id> recordIds) {
        this.recordIds = recordIds;
    }
    
    public void execute(QueueableContext context) {
        // Process batch
        List<Id> currentBatch = new List<Id>();
        List<Id> remaining = new List<Id>();
        
        for (Integer i = 0; i < recordIds.size(); i++) {
            if (i < batchSize) {
                currentBatch.add(recordIds[i]);
            } else {
                remaining.add(recordIds[i]);
            }
        }
        
        // Process current batch
        processRecords(currentBatch);
        
        // Chain next batch if needed
        if (!remaining.isEmpty()) {
            System.enqueueJob(new MCPBatchChainProcessor(remaining));
        }
    }
    
    private void processRecords(List<Id> ids) {
        // Process each record with MCP tool
        for (Id recordId : ids) {
            // ... call MCP tool
        }
    }
}
```
