import { getModelProvider } from "../llm/models";
import type { ApiKeys } from "../api-keys";
import type { ModelType } from "../llm/models";

const WORD_LIMIT = 8;

export function cleanTitle(title: string): string {
  return title
    .trim()
    .replace(/^[`"']|[`"']$/g, "") // Remove leading/trailing quotes or backticks
    .replace(/[`"']/g, ""); // Remove any remaining quotes or backticks within the string
}

export function generateRandomSuffix(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateShadowBranchName(
  title: string,
  taskId: string
): string {
  const branchSafeTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "") // Remove special chars except spaces and hyphens
    .trim()
    .split(/\s+/) // Split by whitespace
    .slice(0, WORD_LIMIT) // Limit words
    .join("-") // Join with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens
  const randomSuffix = generateRandomSuffix(6);

  if (branchSafeTitle) {
    return `shadow/${branchSafeTitle}-${randomSuffix}`;
  } else {
    return `shadow/task-${taskId}`;
  }
}

export interface TitleGenerationConfig {
  taskId: string;
  userPrompt: string;
  apiKeys: ApiKeys;
  fallbackModel?: string;
}

export function getTitleGenerationModel(config: TitleGenerationConfig): {
  provider: "openai" | "anthropic" | "openrouter" /* | "ollama" */;
  modelChoice: string;
} | null {
  const { apiKeys, fallbackModel } = config;

  // Check if any API key is available
  if (
    !apiKeys.openai &&
    !apiKeys.anthropic &&
    !apiKeys.openrouter
    // && !apiKeys.ollama
  ) {
    return null;
  }

  let modelChoice: string;
  let provider: "openai" | "anthropic" | "openrouter" | "ollama";

  if (fallbackModel) {
    // Use the fallback model directly
    provider = getModelProvider(fallbackModel as ModelType);
    modelChoice = fallbackModel as ModelType;
  } else {
    // Default behavior: prefer OpenAI, then Anthropic, then OpenRouter
    if (apiKeys.openai) {
      provider = "openai";
      modelChoice = "gpt-4o" as ModelType;
    } else if (apiKeys.anthropic) {
      provider = "anthropic";
      modelChoice = "claude-3-5-sonnet-20241022" as ModelType;
    } else {
      provider = "openrouter";
      modelChoice = "x-ai/grok-3" as ModelType;
    }
  }

  // Ensure we have the API key for the chosen provider
  if (!apiKeys[provider]) {
    return null;
  }

  return { provider, modelChoice };
}

export function generateTitlePrompt(userPrompt: string): string {
  return `<instructions>
Generate a concise title (under 50 chars) for this user request. If it's a simple word or greeting, use it as-is. If it's a coding task request, summarize the main intent. Return ONLY the title text.
</instructions>

<user-request>
${userPrompt}
</user-request>`;
}
