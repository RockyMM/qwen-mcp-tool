import { z } from 'zod';
import { UnifiedTool } from './registry.js';
import { executeQwenCLI } from '../utils/qwenExecutor.js';
import { STATUS_MESSAGES } from '../constants.js';

const replyArgsSchema = z.object({
  sessionId: z.string().min(1).describe("The session ID to continue (from a previous tool response)"),
  prompt: z.string().min(1).describe("Your follow-up message or question"),
  model: z.string().optional().describe("Optional model to use. If not specified, uses the default model (qwen-plus)."),
});

export const replyTool: UnifiedTool = {
  name: "reply",
  description: "Continue a multi-turn conversation with Qwen using a session ID from a previous response",
  zodSchema: replyArgsSchema,
  prompt: {
    description: "Reply to an existing Qwen session with a follow-up message",
  },
  category: 'qwen',
  execute: async (args, onProgress) => {
    const { prompt, model, sessionId } = args;

    if (!sessionId) {
      throw new Error("sessionId is required. Get it from a previous tool's response.");
    }

    if (!prompt?.trim()) {
      throw new Error("You must provide a prompt for the follow-up message.");
    }

    onProgress?.(`Resuming session ${sessionId}...`);

    const result = await executeQwenCLI(
      prompt,
      model,
      false, // no sandbox
      false, // no changeMode
      onProgress,
      sessionId,
      true // resume=true
    );

    return { text: `${STATUS_MESSAGES.QWEN_RESPONSE}\n${result.output}`, sessionId: result.sessionId };
  }
};
