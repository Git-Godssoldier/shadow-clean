import type { Message } from "@repo/types";
import { ToolComponent } from "./tool";
import { FadedMarkdown } from "../markdown/memoized-markdown";
import { ToolTypes, getMCPToolTitle, getMCPToolPrefix } from "@repo/types";
import { MCPLogo } from "@/components/graphics/icons/mcp-logo";

export function MCPTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  // Get custom title and prefix using utility functions
  const title = getMCPToolTitle(toolMeta.name, toolMeta.args || {});
  const prefix = getMCPToolPrefix(toolMeta.name);

  const renderMarkdownOnly = () => {
    if (!toolMeta.result) {
      return null;
    }

    if (typeof toolMeta.result === "string") {
      const metaResult = toolMeta.result as string;
      const content =
        metaResult.length > 1000
          ? `${metaResult.slice(0, 1000)}\n\n**+ ${metaResult.length - 1000} more chars**`
          : metaResult;

      return <FadedMarkdown content={content} id={`mcp-${message.id}`} />;
    }

    if (typeof toolMeta.result === "object") {
      const result = toolMeta.result;

      // Handle Context7 format with content array - show content[0].text
      if (
        "content" in result &&
        Array.isArray(result.content) &&
        result.content.length > 0
      ) {
        const firstContent = result.content[0];
        if (
          firstContent &&
          typeof firstContent === "object" &&
          "text" in firstContent
        ) {
          const firstContentText = firstContent.text as string;
          const content =
            firstContentText.length > 1000
              ? `${firstContentText.slice(0, 1000)}\n\n**+ ${firstContentText.length - 1000} more chars**`
              : firstContentText;

          return (
            <FadedMarkdown content={content} id={`mcp-content-${message.id}`} />
          );
        }
      }

      if ("content" in result && typeof result.content === "string") {
        const resultContent = result.content as string;
        const content =
          resultContent.length > 1000
            ? `${resultContent.slice(0, 1000)}\n\n+ ${resultContent.length - 1000} more chars`
            : resultContent;

        return (
          <FadedMarkdown content={content} id={`mcp-content-${message.id}`} />
        );
      }
    }

    return null;
  };

  return (
    <ToolComponent
      type={ToolTypes.MCP}
      icon={<MCPLogo />}
      title={title}
      prefix={prefix}
      collapsible={true}
    >
      {/* ONLY the markdown content - no headers, no arguments, no status */}
      {renderMarkdownOnly()}
    </ToolComponent>
  );
}
