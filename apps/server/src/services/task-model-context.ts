import { ApiKeys, ModelType } from "@repo/types";
import { getModelProvider } from "@repo/types";

/**
 * Task-scoped context that encapsulates model selection and API key management.
 */
export class TaskModelContext {
  constructor(
    private taskId: string,
    private mainModel: ModelType,
    private apiKeys: ApiKeys
  ) {}

  getMainModel(): ModelType {
    return this.mainModel;
  }

  getProviderApiKey(): string | undefined {
    const provider = getModelProvider(this.mainModel);
    return this.apiKeys[provider];
  }

  getApiKeys(): ApiKeys {
    return this.apiKeys;
  }

  getProvider(): "anthropic" | "openai" | "openrouter" /* | "ollama" */ {
    return getModelProvider(this.mainModel);
  }

  getModelForOperation(
    _operation: "main" | "commit-msg" | "pr-gen"
  ): ModelType {
    // All operations now use the main model
    return this.getMainModel();
  }

  getApiKeyForOperation(
    operation: "main" | "commit-msg" | "pr-gen"
  ): string | undefined {
    const model = this.getModelForOperation(operation);
    const provider = getModelProvider(model);
    return this.apiKeys[provider];
  }

  validateAccess(): boolean {
    const apiKey = this.getProviderApiKey();
    return !!apiKey;
  }

  validateOperationAccess(
    operation: "main" | "commit-msg" | "pr-gen"
  ): boolean {
    const apiKey = this.getApiKeyForOperation(operation);
    return !!apiKey;
  }

  getTaskId(): string {
    return this.taskId;
  }
}
