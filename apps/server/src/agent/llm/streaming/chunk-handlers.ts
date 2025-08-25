import {
  AIStreamChunk,
  StreamChunk,
  ToolName,
  ToolResultSchemas,
  ValidationErrorResult,
  getModelProvider,
  ModelType,
  isTransformedMCPTool,
} from "@repo/types";
import { ToolValidator } from "../validation/tool-validator";

export class ChunkHandlers {
  private toolValidator = new ToolValidator();

  handleTextDelta(
    chunk: AIStreamChunk & { type: "text-delta" }
  ): StreamChunk | null {
    if (chunk.textDelta) {
      return {
        type: "content",
        content: chunk.textDelta,
      };
    }
    return null;
  }

  handleToolCall(
    chunk: AIStreamChunk & { type: "tool-call" },
    toolCallMap: Map<string, ToolName>
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    // Emit the tool call
    chunks.push({
      type: "tool-call",
      toolCall: {
        id: chunk.toolCallId,
        name: chunk.toolName,
        args: chunk.args,
      },
    });

    if (
      chunk.toolName in ToolResultSchemas ||
      isTransformedMCPTool(chunk.toolName)
    ) {
      // Valid tool (native or MCP) - store in map for result processing
      toolCallMap.set(chunk.toolCallId, chunk.toolName as ToolName);
      if (isTransformedMCPTool(chunk.toolName)) {
        console.log(
          `✅ [MCP_STREAMING] Registered MCP tool call ID: ${chunk.toolCallId} for ${chunk.toolName}`
        );
      }
    } else {
      // Invalid tool - emit immediate error tool-result
      const availableTools = Object.keys(ToolResultSchemas).join(", ");
      const errorMessage = `Unknown tool: ${chunk.toolName}. Available tools are: ${availableTools}`;
      const suggestedFix = `Please use one of the available tools: ${availableTools}`;

      console.warn(`[LLM] Invalid tool call: ${chunk.toolName}`);

      const errorResult: ValidationErrorResult = {
        success: false,
        error: errorMessage,
        suggestedFix,
        originalResult: undefined,
        validationDetails: {
          expectedType: "Known tool name",
          receivedType: `Unknown tool: ${chunk.toolName}`,
          fieldPath: "toolName",
        },
      };

      // Emit immediate error tool-result
      chunks.push({
        type: "tool-result",
        toolResult: {
          id: chunk.toolCallId,
          result: errorResult,
          isValid: false,
        },
      });
    }

    return chunks;
  }

  /**
   * Handle tool-call-streaming-start chunks
   */
  handleToolCallStreamingStart(
    chunk: AIStreamChunk & { type: "tool-call-streaming-start" },
    toolCallMap: Map<string, ToolName>
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    // Emit the tool call start
    chunks.push({
      type: "tool-call-start",
      toolCallStart: {
        id: chunk.toolCallId,
        name: chunk.toolName,
      },
    });

    if (
      chunk.toolName in ToolResultSchemas ||
      isTransformedMCPTool(chunk.toolName)
    ) {
      toolCallMap.set(chunk.toolCallId, chunk.toolName as ToolName);
      if (isTransformedMCPTool(chunk.toolName)) {
        console.log(
          `✅ [MCP_STREAMING_START] Registered MCP streaming tool ID: ${chunk.toolCallId} for ${chunk.toolName}`
        );
      }
    } else {
      console.warn(
        `[LLM] Invalid tool call streaming start: ${chunk.toolName}`
      );
    }

    return chunks;
  }

  /**
   * Handle tool-call-delta chunks
   */
  handleToolCallDelta(
    chunk: AIStreamChunk & { type: "tool-call-delta" }
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    // Emit the tool call delta
    chunks.push({
      type: "tool-call-delta",
      toolCallDelta: {
        id: chunk.toolCallId,
        name: chunk.toolName,
        argsTextDelta: chunk.argsTextDelta,
      },
    });

    return chunks;
  }

  /**
   * Handle tool-result chunks
   */
  handleToolResult(
    chunk: AIStreamChunk & { type: "tool-result" },
    toolCallMap: Map<string, ToolName>
  ): StreamChunk | null {
    const toolName = toolCallMap.get(chunk.toolCallId);

    if (!toolName) {
      console.warn({ availableIds: Array.from(toolCallMap.keys()) });
      return null;
    }

    // Validate tool execution results (not parameters - those are handled by AI SDK repair)
    // This catches: malformed tool outputs, implementation bugs, external service failures
    const validation = this.toolValidator.validateToolResult(
      toolName,
      chunk.result
    );

    if (validation.isValid) {
      // Valid result - emit normal tool-result
      return {
        type: "tool-result",
        toolResult: {
          id: chunk.toolCallId,
          result: validation.validatedResult,
          isValid: true,
        },
      };
    } else {
      // Invalid result - emit tool-result with validation error
      console.warn(`[CHUNK_DEBUG] Tool validation failed for ${toolName}:`, {
        error: validation.errorDetails?.error,
        suggestedFix: validation.errorDetails?.suggestedFix,
        shouldEmitError: validation.shouldEmitError,
      });

      return {
        type: "tool-result",
        toolResult: {
          id: chunk.toolCallId,
          result: validation.validatedResult,
          isValid: false,
        },
      };
    }
  }

  /**
   * Handle finish chunks
   */
  handleFinish(
    chunk: AIStreamChunk & { type: "finish" },
    model: ModelType
  ): StreamChunk[] {
    const chunks: StreamChunk[] = [];

    // Emit final usage and completion
    if (chunk.usage) {
      chunks.push({
        type: "usage",
        usage: {
          promptTokens: chunk.usage.promptTokens,
          completionTokens: chunk.usage.completionTokens,
          totalTokens: chunk.usage.totalTokens,
          // Include cache metadata for Anthropic models if available
          // Note: Cache metadata will be available in future AI SDK versions
          // For now, we'll log when cache control is enabled for debugging
          ...(getModelProvider(model) === "anthropic" && {
            cacheCreationInputTokens: undefined, // Will be populated by future SDK versions
            cacheReadInputTokens: undefined, // Will be populated by future SDK versions
          }),
        },
      });
    }

    chunks.push({
      type: "complete",
      finishReason: chunk.finishReason,
    });

    return chunks;
  }

  handleError(chunk: AIStreamChunk & { type: "error" }): StreamChunk {
    return {
      type: "error",
      error:
        chunk.error instanceof Error
          ? chunk.error.message
          : "Unknown error occurred",
      finishReason: "error",
    };
  }

  handleReasoning(
    chunk: AIStreamChunk & { type: "reasoning" }
  ): StreamChunk | null {
    if (chunk.textDelta) {
      return {
        type: "reasoning",
        reasoning: chunk.textDelta,
      };
    }
    return null;
  }

  handleReasoningSignature(
    chunk: AIStreamChunk & { type: "reasoning-signature" }
  ): StreamChunk | null {
    return {
      type: "reasoning-signature",
      reasoningSignature: chunk.signature,
    };
  }

  handleRedactedReasoning(
    chunk: AIStreamChunk & { type: "redacted-reasoning" }
  ): StreamChunk | null {
    return {
      type: "redacted-reasoning",
      redactedReasoningData: chunk.data,
    };
  }
}
