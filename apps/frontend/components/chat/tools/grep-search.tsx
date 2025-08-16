import type { Message, GrepResult } from "@repo/types";
import { Filter, File, Search, Plus } from "lucide-react";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";
import { getToolResult } from "@repo/types";

export function GrepSearchTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;
  const query = args.query as string;
  const includePattern = args.include_pattern as string;
  const excludePattern = args.exclude_pattern as string;
  const caseSensitive = args.case_sensitive as boolean;

  const result = getToolResult(toolMeta, "grep_search") as GrepResult | null;
  const title = `${query}${caseSensitive ? " (case sensitive)" : ""}`;

  return (
    <ToolComponent
      icon={<Search />}
      type={ToolTypes.GREP_SEARCH}
      title={title}
      collapsible
    >
      {(includePattern || excludePattern) && (
        <div className="text-muted-foreground flex items-center gap-1">
          <Filter className="size-4" />
          <div>
            {includePattern && (
              <span>
                include:{" "}
                <code className="bg-card rounded px-1 font-normal">
                  {includePattern}
                </code>
              </span>
            )}
            {includePattern && excludePattern && <span>, </span>}
            {excludePattern && (
              <span>
                exclude:{" "}
                <code className="bg-card rounded px-1 font-normal">
                  {excludePattern}
                </code>
              </span>
            )}
          </div>
        </div>
      )}

      {result && status === "COMPLETED" && (
        <div className="flex flex-col gap-0.5">
          {result.detailedMatches && result.detailedMatches.length > 0 ? (
            <>
              {result.detailedMatches.slice(0, 10).map((match, index) => (
                <div key={index} className="flex items-center gap-2 py-px">
                  <File className="size-4 shrink-0" />
                  <span className="truncate">
                    {match.file}:{match.lineNumber}
                  </span>
                </div>
              ))}
              {result.detailedMatches.length > 10 && (
                <div className="flex items-center gap-2 py-px opacity-70">
                  <Plus className="size-4" />
                  <span>{result.detailedMatches.length - 10} more...</span>
                </div>
              )}
            </>
          ) : result.matches && result.matches.length > 0 ? (
            <>
              {result.matches.slice(0, 10).map((match, index) => {
                // Parse typical grep format: "filename:linenumber:content"
                const parts = match.split(":");
                const filePath = parts[0];
                const lineNumber = parts[1];
                const displayText = lineNumber
                  ? `${filePath}:${lineNumber}`
                  : filePath;

                return (
                  <div key={index} className="flex items-center gap-2 py-px">
                    <File className="size-4 shrink-0" />
                    <span className="truncate">{displayText}</span>
                  </div>
                );
              })}
              {result.matches.length > 10 && (
                <div className="flex items-center gap-2 py-px opacity-70">
                  <Plus className="size-4" />
                  <span>{result.matches.length - 10} more...</span>
                </div>
              )}
            </>
          ) : (
            <div>No results found</div>
          )}
        </div>
      )}
    </ToolComponent>
  );
}
