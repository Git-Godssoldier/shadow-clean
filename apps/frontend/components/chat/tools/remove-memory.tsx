import type { Message } from "@repo/types";
import { Brain } from "lucide-react";
import { getToolResult, ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function RemoveMemoryTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args } = toolMeta;
  const memoryId = args.memoryId as string;
  const result = getToolResult(toolMeta, "remove_memory");
  const content = result?.removedMemory?.content;

  return (
    <ToolComponent
      icon={<Brain className="text-destructive" />}
      type={ToolTypes.REMOVE_MEMORY}
      title={`"${content ? content : memoryId}"`}
    />
  );
}
