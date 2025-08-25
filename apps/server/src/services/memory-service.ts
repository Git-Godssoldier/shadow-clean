import { prisma } from "@repo/db";

export interface MemoryContext {
  memories: Array<{
    id: string;
    content: string;
    category: string;
    createdAt: Date;
  }>;
}

export class MemoryService {
  /**
   * Get repository-specific memories for a task context
   */
  async getMemoriesForTask(taskId: string): Promise<MemoryContext | null> {
    try {
      // Get task info
      const task = await prisma.task.findUnique({
        where: { id: taskId },
        select: { repoFullName: true, userId: true },
      });

      if (!task) {
        console.warn(`[MEMORY_SERVICE] Task ${taskId} not found`);
        return null;
      }

      // Get repository-specific memories
      const memories = await prisma.memory.findMany({
        where: {
          userId: task.userId,
          repoFullName: task.repoFullName,
        },
        orderBy: [
          { category: "asc" },
          { createdAt: "desc" },
        ],
        select: {
          id: true,
          content: true,
          category: true,
          createdAt: true,
        },
      });

      return {
        memories: memories.map((m) => ({
          id: m.id,
          content: m.content,
          category: m.category,
          createdAt: m.createdAt,
        })),
      };
    } catch (error) {
      console.error(
        `[MEMORY_SERVICE] Error fetching memories for task ${taskId}:`,
        error
      );
      return null;
    }
  }

  /**
   * Format memories into a string for system prompt inclusion
   */
  formatMemoriesForPrompt(memoryContext: MemoryContext): string {
    if (!memoryContext || memoryContext.memories.length === 0) {
      return "";
    }

    let formatted = `\n\n## REPOSITORY MEMORIES\nRelevant context from previous work:\n`;
    for (const m of memoryContext.memories) {
      formatted += `- [${m.category}] ${m.content}\n`;
    }
    formatted += `\nUse these memories to maintain consistency.`;
    return formatted;
  }

  /**
   * Create a system prompt with memory context included
   */
  async createSystemPromptWithMemories(
    basePrompt: string,
    taskId: string
  ): Promise<string> {
    const memoryContext = await this.getMemoriesForTask(taskId);
    if (!memoryContext) {
      return basePrompt;
    }
    return basePrompt + this.formatMemoriesForPrompt(memoryContext);
  }
}

export const memoryService = new MemoryService();
