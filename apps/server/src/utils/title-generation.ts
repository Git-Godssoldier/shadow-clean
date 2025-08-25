import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  cleanTitle,
  generateShadowBranchName,
  getTitleGenerationModel,
  generateTitlePrompt,
} from "@repo/types";
import { TaskModelContext } from "../services/task-model-context";
import { braintrustService } from "../agent/llm/observability/braintrust-service";

export async function generateTaskTitleAndBranch(
  taskId: string,
  userPrompt: string,
  context: TaskModelContext
): Promise<{ title: string; shadowBranch: string }> {
  try {
    // Get API keys from context if provided
    const apiKeys = context.getApiKeys() || {
      openai: undefined,
      anthropic: undefined,
      openrouter: undefined,
    };

    // Get the main model to determine provider for mini model selection
    const fallbackModel = context.getMainModel();

    const modelConfig = getTitleGenerationModel({
      taskId,
      userPrompt,
      apiKeys,
      fallbackModel,
    });

    if (!modelConfig) {
      console.warn(
        `[GENERATE_TITLE_BRANCH] No API keys provided, skipping title generation for task ${taskId}`
      );
      return {
        title: userPrompt.slice(0, 50),
        shadowBranch: `shadow/task-${taskId}`,
      };
    }

    const model =
      modelConfig.provider === "openai"
        ? openai(modelConfig.modelChoice)
        : modelConfig.provider === "anthropic"
          ? anthropic(modelConfig.modelChoice)
          : createOpenRouter({
              apiKey: apiKeys.openrouter!,
              headers: {
                "HTTP-Referer": "https://shadowrealm.ai",
                "X-Title": "Shadow Agent",
              },
            }).chat(modelConfig.modelChoice);

    const { text: generatedText } = await generateText({
      model,
      temperature: 0.3,
      prompt: generateTitlePrompt(userPrompt),
      experimental_telemetry: braintrustService.getOperationTelemetry(
        "title-generation",
        {
          taskId,
          provider: modelConfig.provider,
          model: modelConfig.modelChoice,
          promptLength: userPrompt.length,
          temperature: 0.3,
        }
      ),
    });

    const title = cleanTitle(generatedText);

    console.log(
      `[GENERATE_TITLE_BRANCH] Generated title for task ${taskId}: "${title}" using ${modelConfig.provider} ${modelConfig.modelChoice}`
    );

    return { title, shadowBranch: generateShadowBranchName(title, taskId) };
  } catch (error) {
    console.error(
      `[GENERATE_TITLE_BRANCH] Failed to generate title for task ${taskId}:`,
      error
    );
    // Don't throw error, just log it - title generation is not critical
    return {
      title: userPrompt.slice(0, 50),
      shadowBranch: `shadow/task-${taskId}`,
    };
  }
}
