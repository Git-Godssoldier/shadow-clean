import type { Message } from "@repo/types";
import { TerminalSquare } from "lucide-react";
import { useAgentEnvironment } from "@/components/agent-environment/agent-environment-context";
import { getToolResult } from "@repo/types";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function RunTerminalCmdTool({ message }: { message: Message }) {
  const { openAgentEnvironment } = useAgentEnvironment();

  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;

  const streamingPartialArgs = message.metadata?.partialArgs;
  const command = (streamingPartialArgs?.command || args.command) as string;

  const isBackground = args.is_background as boolean;

  // Use typed tool result accessor
  const result = getToolResult(toolMeta, "run_terminal_cmd");
  const _output = result?.stdout || result?.stderr || "";
  const _error = result?.stderr;

  const isLoading = status === "RUNNING";

  const suffix = isBackground ? " (Background)" : undefined;

  return (
    <ToolComponent
      icon={<TerminalSquare />}
      type={ToolTypes.RUN_TERMINAL_CMD}
      title={command}
      suffix={suffix}
      hasStdErr={!!_error}
      isLoading={isLoading}
      onClick={() => openAgentEnvironment()}
    />
  );
}
