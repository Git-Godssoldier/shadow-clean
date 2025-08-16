import type { Message } from "@repo/types";
import { Eye } from "lucide-react";
import { useAgentEnvironment } from "@/components/agent-environment/agent-environment-context";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function ReadFileTool({ message }: { message: Message }) {
  const { updateSelectedFilePath, openAgentEnvironment } = useAgentEnvironment();

  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;
  const filePath = args.target_file as string;
  const startLine = args.start_line_one_indexed as number;
  const endLine = args.end_line_one_indexed_inclusive as number;

  const lineRange =
    startLine && endLine ? `${startLine}-${endLine}` : undefined;

  const isLoading = status === "RUNNING";

  return (
    <ToolComponent
      icon={<Eye />}
      type={ToolTypes.READ_FILE}
      title={filePath}
      suffix={lineRange}
      showFileIcon={filePath}
      isLoading={isLoading}
      onClick={() => {
        updateSelectedFilePath(filePath);
        openAgentEnvironment();
      }}
    />
  );
}
