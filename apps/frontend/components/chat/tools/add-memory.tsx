import type { Message } from "@repo/types";
import { Brain } from "lucide-react";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function AddMemoryTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args } = toolMeta;
  const content = args.content as string;

  return (
    <ToolComponent
      icon={<Brain />}
      type={ToolTypes.ADD_MEMORY}
      title={`"${content}"`}
    />
  );
}
