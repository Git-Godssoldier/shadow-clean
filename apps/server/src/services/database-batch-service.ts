import { prisma } from "@repo/db";
import { AssistantMessagePart, MessageMetadata } from "@repo/types";
import { TextPart } from "ai";
import { TaskModelContext } from "./task-model-context";

// Type for batched assistant message updates
type AssistantUpdateData = {
  messageId: string;
  assistantParts: AssistantMessagePart[];
  context: TaskModelContext;
  usageMetadata?: MessageMetadata["usage"];
  finishReason?: MessageMetadata["finishReason"];
  lastUpdateTime: number;
};

export class DatabaseBatchService {
  private pendingUpdates: Map<string, NodeJS.Timeout> = new Map();
  private updateBuffer: Map<string, AssistantUpdateData> = new Map();
  private static readonly DB_UPDATE_INTERVAL_MS = 1000;

  constructor() {
    process.on("SIGTERM", () => this.flushAll());
    process.on("SIGINT", () => this.flushAll());
  }

  /**
   * Schedule a database update for an assistant message with 1-second batching
   */
  scheduleAssistantUpdate(
    taskId: string,
    updateData: AssistantUpdateData
  ): void {
    // Update the buffer with latest data
    this.updateBuffer.set(taskId, {
      ...updateData,
      lastUpdateTime: Date.now(),
    });

    // If there's already a timer running, don't create another one
    if (this.pendingUpdates.has(taskId)) {
      return;
    }


    // Set up timer to flush this task's updates
    const timer = setTimeout(async () => {
      await this.flushAssistantUpdate(taskId);
    }, DatabaseBatchService.DB_UPDATE_INTERVAL_MS);

    this.pendingUpdates.set(taskId, timer);
  }

  /**
   * Immediately flush database updates for a specific assistant message
   */
  async flushAssistantUpdate(taskId: string): Promise<void> {
    const updateData = this.updateBuffer.get(taskId);
    if (!updateData) {
      return;
    }

    console.log(`[DB_BATCH] Flushing update for task ${taskId}`);

    try {
      // Build full content from text parts
      const fullContent = updateData.assistantParts
        .filter((part) => part.type === "text")
        .map((part) => (part as TextPart).text)
        .join("");

      // Build metadata
      const metadata: MessageMetadata = {
        usage: updateData.usageMetadata,
        finishReason: updateData.finishReason,
        isStreaming: !updateData.finishReason, // If we have finishReason, streaming is done
        parts: updateData.assistantParts,
      };

      // Update the assistant message
      await prisma.chatMessage.update({
        where: { id: updateData.messageId },
        data: {
          content: fullContent,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          metadata: metadata as any,
          // Include denormalized usage fields if available
          ...(updateData.usageMetadata && {
            promptTokens: updateData.usageMetadata.promptTokens,
            completionTokens: updateData.usageMetadata.completionTokens,
            totalTokens: updateData.usageMetadata.totalTokens,
          }),
          ...(updateData.finishReason && {
            finishReason: updateData.finishReason,
          }),
        },
      });

    } catch (error) {
      console.error(
        `[DB_BATCH] Failed to flush DB update for task ${taskId}:`,
        error
      );
    } finally {
      // Clean up
      this.clear(taskId);
    }
  }

  /**
   * Clear the database update timer and buffer for a task
   */
  clear(taskId: string): void {
    const timer = this.pendingUpdates.get(taskId);
    if (timer) {
      clearTimeout(timer);
      this.pendingUpdates.delete(taskId);
    }
    this.updateBuffer.delete(taskId);
  }

  /**
   * Force flush all pending database updates (used on shutdown or cleanup)
   */
  async flushAll(): Promise<void> {
    const flushPromises: Promise<void>[] = [];

    for (const taskId of this.updateBuffer.keys()) {
      flushPromises.push(this.flushAssistantUpdate(taskId));
    }

    await Promise.all(flushPromises);
  }
}

// Export singleton instance
export const databaseBatchService = new DatabaseBatchService();
