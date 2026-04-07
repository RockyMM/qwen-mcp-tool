#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { Logger } from "./utils/logger.js";
import { PROTOCOL, ToolArguments } from "./constants.js";

import {
  getToolDefinitions,
  getPromptDefinitions,
  executeTool,
  toolExists,
  getPromptMessage,
  UnifiedTool
} from "./tools/index.js";

const server = new McpServer(
  {
    name: "qwen-cli-mcp",
    version: "0.0.1",
  },
  {
    capabilities: {
      logging: {},
    },
  },
);

let isProcessing = false; let currentOperationName = ""; let latestOutput = "";

async function sendNotification(method: string, params: any) {
  try {
    await server.server.notification({ method, params });
  } catch (error) {
    Logger.error("notification failed: ", error);
  }
}

/**
 * @param progressToken The progress token provided by the client
 * @param progress The current progress value
 * @param total Optional total value
 * @param message Optional status message
 */
async function sendProgressNotification(
  progressToken: string | number | undefined,
  progress: number,
  total?: number,
  message?: string
) {
  if (!progressToken) return; // Only send if client requested progress

  try {
    const params: any = {
      progressToken,
      progress
    };

    if (total !== undefined) params.total = total; // future cache progress
    if (message) params.message = message;

    await server.server.notification({
      method: PROTOCOL.NOTIFICATIONS.PROGRESS,
      params
    });
  } catch (error) {
    Logger.error("Failed to send progress notification:", error);
  }
}

function startProgressUpdates(
  operationName: string,
  progressToken?: string | number
) {
  isProcessing = true;
  currentOperationName = operationName;
  latestOutput = ""; // Reset latest output

  const progressMessages = [
    `🧠 ${operationName} - Qwen is analyzing your request...`,
    `📊 ${operationName} - Processing files and generating insights...`,
    `✨ ${operationName} - Creating structured response for your review...`,
    `⏱️ ${operationName} - Large analysis in progress (this is normal for big requests)...`,
    `🔍 ${operationName} - Still working... Qwen takes time for quality results...`,
  ];

  let messageIndex = 0;
  let progress = 0;

  // Send immediate acknowledgment if progress requested
  if (progressToken) {
    sendProgressNotification(
      progressToken,
      0,
      undefined, // No total - indeterminate progress
      `🔍 Starting ${operationName}`
    );
  }

  // Keep client alive with periodic updates
  const progressInterval = setInterval(async () => {
    if (isProcessing && progressToken) {
      // Simply increment progress value
      progress += 1;

      // Include latest output if available
      const baseMessage = progressMessages[messageIndex % progressMessages.length];
      const outputPreview = latestOutput.slice(-150).trim(); // Last 150 chars
      const message = outputPreview
        ? `${baseMessage}\n📝 Output: ...${outputPreview}`
        : baseMessage;

      await sendProgressNotification(
        progressToken,
        progress,
        undefined, // No total - indeterminate progress
        message
      );
      messageIndex++;
    } else if (!isProcessing) {
      clearInterval(progressInterval);
    }
  }, PROTOCOL.KEEPALIVE_INTERVAL); // Every 25 seconds

  return { interval: progressInterval, progressToken };
}

function stopProgressUpdates(
  progressData: { interval: NodeJS.Timeout; progressToken?: string | number },
  success: boolean = true
) {
  const operationName = currentOperationName; // Store before clearing
  isProcessing = false;
  currentOperationName = "";
  clearInterval(progressData.interval);

  // Send final progress notification if client requested progress
  if (progressData.progressToken) {
    sendProgressNotification(
      progressData.progressToken,
      100,
      100,
      success ? `✅ ${operationName} completed successfully` : `❌ ${operationName} failed`
    );
  }
}

// Register all tools using McpServer API
function registerAllTools() {
  const tools = getToolDefinitions();
  
  tools.forEach((tool: UnifiedTool) => {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.zodSchema,
      },
      async (args: ToolArguments) => {
        // Check if client requested progress updates
        const progressToken = (args as any)._meta?.progressToken;

        // Start progress updates if client requested them
        const progressData = startProgressUpdates(tool.name, progressToken);

        try {
          // Execute the tool using the unified registry with progress callback
          const result = await executeTool(tool.name, args, (newOutput) => {
            latestOutput = newOutput;
          });

          // Stop progress updates
          stopProgressUpdates(progressData, true);

          const callResult: CallToolResult = {
            content: [
              {
                type: "text",
                text: result,
              },
            ],
            isError: false,
          };
          
          return callResult;
        } catch (error) {
          // Stop progress updates on error
          stopProgressUpdates(progressData, false);

          Logger.error(`Error in tool '${tool.name}':`, error);

          const errorMessage =
            error instanceof Error ? error.message : String(error);

          const callResult: CallToolResult = {
            content: [
              {
                type: "text",
                text: `Error executing ${tool.name}: ${errorMessage}`,
              },
            ],
            isError: true,
          };
          
          return callResult;
        }
      }
    );
  });
}

// Register all prompts using McpServer API
function registerAllPrompts() {
  const prompts = getPromptDefinitions();
  
  prompts.forEach((prompt) => {
    server.registerPrompt(
      prompt.name,
      {
        description: prompt.description,
        argsSchema: {}, // Empty schema as prompts are retrieved dynamically
      },
      async (args) => {
        const promptMessage = getPromptMessage(prompt.name, args);
        
        if (!promptMessage) {
          throw new Error(`Unknown prompt: ${prompt.name}`);
        }
        
        return {
          messages: [{
            role: "user" as const,
            content: {
              type: "text" as const,
              text: promptMessage
            }
          }]
        };
      }
    );
  });
}

// Initialize tools and prompts
registerAllTools();
registerAllPrompts();

// Start the server
async function main() {
  Logger.debug("init qwen-mcp-tool");
  const transport = new StdioServerTransport(); 
  await server.connect(transport);
  Logger.debug("qwen-mcp-tool listening on stdio");
} 

main().catch((error) => {
  Logger.error("Fatal error:", error); 
  process.exit(1); 
});
