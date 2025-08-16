import { AssistantMessagePart } from "@repo/types";
import { ToolCallPart, ToolResultPart } from "ai";

/**
 * Prevents duplicate tool-call/tool-result pairs when joining mid-stream
 */
export function deduplicatePartsFromMap(
  existingParts: AssistantMessagePart[],
  streamingPartsMap: Map<string, AssistantMessagePart>,
  streamingPartsOrder: string[]
): AssistantMessagePart[] {
  const existingToolIds = new Set(
    existingParts
      .filter((p): p is ToolCallPart | ToolResultPart => "toolCallId" in p)
      .map((p) => p.toolCallId)
  );

  // Iterate through streaming parts in order, filtering duplicates
  const newParts: AssistantMessagePart[] = [];
  for (const id of streamingPartsOrder) {
    const part = streamingPartsMap.get(id);
    if (part) {
      if ("toolCallId" in part) {
        if (!existingToolIds.has(part.toolCallId)) {
          newParts.push(part);
        }
      } else {
        newParts.push(part);
      }
    }
  }

  return [...existingParts, ...newParts];
}

/**
 * Converts Map storage to parts array in the correct order
 */
export function convertMapToPartsArray(
  streamingPartsMap: Map<string, AssistantMessagePart>,
  streamingPartsOrder: string[]
): AssistantMessagePart[] {
  const streamingParts: AssistantMessagePart[] = [];
  for (const id of streamingPartsOrder) {
    const part = streamingPartsMap.get(id);
    if (part) {
      streamingParts.push(part);
    }
  }
  return streamingParts;
}
