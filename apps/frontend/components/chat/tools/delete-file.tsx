import type { Message } from "@repo/types";
import { Trash2 } from "lucide-react";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function DeleteFileTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;
  const filePath = args.target_file as string;

  const isLoading = status === "RUNNING";

  return (
    <ToolComponent
      icon={<Trash2 className="text-destructive" />}
      type={ToolTypes.DELETE_FILE}
      title={filePath}
      showFileIcon={filePath}
      isLoading={isLoading}
    />
  );
}
