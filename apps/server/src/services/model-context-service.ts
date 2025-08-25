import { prisma } from "@repo/db";
import { ApiKeys, ModelType } from "@repo/types";
import { TaskModelContext } from "./task-model-context";
import { parseApiKeysFromCookies } from "../utils/cookie-parser";

/**
 * Singleton service for creating and managing task model contexts.
 * Provides request-scoped caching to reduce database queries.
 */
export class ModelContextService {
  private static instance: ModelContextService;
  private contextCache = new Map<string, TaskModelContext>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  private constructor() {}

  static getInstance(): ModelContextService {
    if (!ModelContextService.instance) {
      ModelContextService.instance = new ModelContextService();
    }
    return ModelContextService.instance;
  }

  /**
   * Create a new task model context from cookie header and model selection
   * This is typically called at the start of a request (API endpoint or WebSocket)
   */
  async createContext(
    taskId: string,
    cookieHeader: string | undefined,
    selectedModel: ModelType
  ): Promise<TaskModelContext> {
    const apiKeys = parseApiKeysFromCookies(cookieHeader);

    const context = new TaskModelContext(taskId, selectedModel, apiKeys);

    // Update the task's mainModel field to keep it current
    await this.updateTaskMainModel(taskId, selectedModel);

    // Cache the context for this request
    this.cacheContext(taskId, context);

    return context;
  }

  async copyContext(
    taskId: string,
    context: TaskModelContext
  ): Promise<TaskModelContext> {
    const newContext = new TaskModelContext(
      taskId,
      context.getMainModel(),
      context.getApiKeys()
    );
    this.cacheContext(taskId, newContext);
    return newContext;
  }

  /**
   * Get existing context for a task (from cache or database)
   * This is used by services that need the context but don't have direct access to cookies
   */
  async getContextForTask(
    taskId: string,
    fallbackApiKeys?: ApiKeys
  ): Promise<TaskModelContext | null> {
    const cached = this.getCachedContext(taskId);
    if (cached) {
      return cached;
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { mainModel: true },
    });

    if (!task?.mainModel) {
      return null;
    }

    if (fallbackApiKeys) {
      const context = new TaskModelContext(
        taskId,
        task.mainModel as ModelType,
        fallbackApiKeys
      );
      this.cacheContext(taskId, context);
      return context;
    }

    return null;
  }

  /**
   * Update a task's main model and refresh the context cache
   */
  async updateTaskMainModel(
    taskId: string,
    newModel: ModelType
  ): Promise<void> {
    await prisma.task.update({
      where: { id: taskId },
      data: { mainModel: newModel },
    });
  }

  /**
   * Get context with fresh API keys (for operations that need current keys)
   */
  async refreshContext(
    taskId: string,
    cookieHeader: string | undefined
  ): Promise<TaskModelContext | null> {
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { mainModel: true },
    });

    if (!task?.mainModel) {
      return null;
    }

    const apiKeys = parseApiKeysFromCookies(cookieHeader);

    const context = new TaskModelContext(
      taskId,
      task.mainModel as ModelType,
      apiKeys
    );

    this.cacheContext(taskId, context);
    return context;
  }

  /**
   * Create context for stacked task inheriting API keys from parent
   */
  async createContextWithInheritedKeys(
    taskId: string,
    selectedModel: ModelType,
    inheritedApiKeys: ApiKeys
  ): Promise<TaskModelContext> {
    console.log(
      `[API_KEY_DEBUG] Creating inherited context for task ${taskId}`
    );
    console.log(
      `[API_KEY_DEBUG] Inherited keys: ${JSON.stringify(Object.keys(inheritedApiKeys))}`
    );
    console.log(`[API_KEY_DEBUG] Selected model: ${selectedModel}`);

    const context = new TaskModelContext(
      taskId,
      selectedModel,
      inheritedApiKeys
    );

    console.log(
      `[API_KEY_DEBUG] Created context validates access: ${context.validateAccess()}`
    );

    // Update task's mainModel and cache the context
    await this.updateTaskMainModel(taskId, selectedModel);
    this.cacheContext(taskId, context);

    return context;
  }

  /**
   * Validate that a context has the required API keys for an operation
   */
  validateContextForOperation(
    context: TaskModelContext,
    operation: "main" | "commit-msg" | "pr-gen"
  ): { valid: boolean; missingProvider?: string } {
    if (!context.validateOperationAccess(operation)) {
      const provider = context.getProvider();
      return { valid: false, missingProvider: provider };
    }
    return { valid: true };
  }

  /**
   * Cache management methods
   */
  private cacheContext(taskId: string, context: TaskModelContext): void {
    this.contextCache.set(taskId, context);
    this.cacheExpiry.set(taskId, Date.now() + this.CACHE_TTL_MS);
  }

  private getCachedContext(taskId: string): TaskModelContext | null {
    const expiry = this.cacheExpiry.get(taskId);
    if (!expiry || Date.now() > expiry) {
      this.invalidateCache(taskId);
      return null;
    }
    return this.contextCache.get(taskId) || null;
  }

  private invalidateCache(taskId: string): void {
    this.contextCache.delete(taskId);
    this.cacheExpiry.delete(taskId);
  }

  /**
   * Clean up expired cache entries (called periodically)
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [taskId, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.invalidateCache(taskId);
      }
    }
  }
}

// Export singleton instance
export const modelContextService = ModelContextService.getInstance();

// Setup periodic cache cleanup
setInterval(() => {
  modelContextService.cleanupExpiredCache();
}, 60 * 1000); // Every minute
