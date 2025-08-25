import type { Message } from "@repo/types";
import { Edit3 } from "lucide-react";
import { useAgentEnvironment } from "@/components/agent-environment/agent-environment-context";
import { getToolResult } from "@repo/types";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function EditFileTool({ message }: { message: Message }) {
  const { updateSelectedFilePath, openAgentEnvironment } = useAgentEnvironment();

  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;
  const filePath = args.target_file as string;
  const isNewFile = args.is_new_file as boolean;
  const result = getToolResult(toolMeta, "edit_file");
  const linesAdded = result?.linesAdded || 0;
  const linesRemoved = result?.linesRemoved || 0;

  // streaming state from message metadata (can use later)
  const _streamingState = message.metadata?.streamingState;
  const _partialArgs = message.metadata?.partialArgs;

  const changes =
    status === "COMPLETED" && (linesAdded > 0 || linesRemoved > 0)
      ? { linesAdded, linesRemoved }
      : undefined;

  const isLoading = status === "RUNNING";

  return (
    <ToolComponent
      icon={<Edit3 />}
      type={ToolTypes.EDIT_FILE}
      title={filePath}
      changes={changes}
      showFileIcon={filePath}
      isLoading={isLoading}
      prefix={isNewFile ? "Create" : undefined}
      onClick={() => {
        updateSelectedFilePath(filePath);
        openAgentEnvironment();
      }}
    />
  );
}
