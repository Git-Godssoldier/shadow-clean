import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ToolTypes, TOOL_PREFIXES } from "@repo/types";
import { AlertCircle, ChevronRight, Expand, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { FileIcon } from "@/components/ui/file-icon";

export function ToolComponent({
  type,
  icon,
  title,
  changes,
  hasStdErr,
  prefix,
  suffix,
  showFileIcon,
  collapsible = false,
  forceOpen = false,
  onClick,
  children,
  isLoading = false,
}: {
  type: ToolTypes | "error" | "warning";
  icon?: React.ReactNode;
  title?: string;
  suffix?: string;
  prefix?: string;
  showFileIcon?: string;
  changes?: {
    linesAdded: number;
    linesRemoved: number;
  };
  hasStdErr?: boolean;
  className?: string;
  collapsible?: boolean;
  forceOpen?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
  isLoading?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(forceOpen || false);

  // useEffect for if it changes
  useEffect(() => {
    setIsExpanded(forceOpen);
  }, [forceOpen]);

  const displayPrefix =
    prefix || (type in TOOL_PREFIXES ? TOOL_PREFIXES[type as ToolTypes] : "");

  const isReasoning =
    type === ToolTypes.REASONING || type === ToolTypes.REDACTED_REASONING;

  return (
    <div className="flex flex-col gap-1">
      <ToolWrapper
        collapsible={collapsible}
        onClick={onClick}
        isExpanded={isExpanded}
        toggleExpanded={() => setIsExpanded(!isExpanded)}
        isReasoning={isReasoning}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" />
        ) : isReasoning ? (
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 opacity-70 transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        ) : icon ? (
          icon
        ) : null}
        <div className="flex w-[calc(100%-1.5rem)] items-center gap-1">
          {displayPrefix && (
            <div className="whitespace-nowrap opacity-70">{displayPrefix}</div>
          )}
          {showFileIcon && (
            <FileIcon filename={showFileIcon} className="size-3.5 opacity-70" />
          )}
          <div className="truncate">{title}</div>
          {hasStdErr && (
            <AlertCircle className="text-destructive ml-1 shrink-0" />
          )}
          {!isLoading && changes && (
            <div className="flex items-center gap-1">
              <span className="text-green-400">+{changes.linesAdded}</span>
              <span className="text-destructive">-{changes.linesRemoved}</span>
            </div>
          )}
          {suffix && (
            <div className="whitespace-nowrap opacity-70">{suffix}</div>
          )}
        </div>
      </ToolWrapper>
      {isExpanded && (
        <div className="animate-in fade-in-0 slide-in-from-top-2 ease-out-quad flex w-full items-start overflow-hidden duration-200">
          <div className="text-muted-foreground pl-8.5 flex grow flex-col gap-2 overflow-hidden text-[13px]">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

const ToolWrapper = ({
  children,
  collapsible,
  className,
  onClick,
  toggleExpanded,
  isExpanded,
  isReasoning,
}: {
  children: React.ReactNode;
  collapsible: boolean;
  className?: string;
  onClick?: () => void;
  isExpanded: boolean;
  toggleExpanded: () => void;
  isReasoning: boolean;
}) => {
  if (collapsible || onClick) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "text-muted-foreground hover:text-foreground group/tool px-3! w-full justify-between gap-2 overflow-hidden text-[13px] font-normal [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70",
          className
        )}
        // If an onClick is passed in, do that instead of toggling the expanded state
        onClick={onClick ? onClick : toggleExpanded}
      >
        <div className="flex grow items-center gap-2 overflow-hidden">
          {children}
        </div>
        {!isReasoning &&
          (collapsible ? (
            <ChevronRight
              className={cn(
                "opacity-0! group-hover/tool:opacity-100! text-muted-foreground size-3.5 shrink-0 rotate-0 transition-all",
                isExpanded && "rotate-90"
              )}
            />
          ) : (
            <Expand className="opacity-0! group-hover/tool:opacity-100! text-muted-foreground size-3.5 shrink-0 transition-all" />
          ))}
      </Button>
    );
  }
  return (
    <div
      className={cn(
        "text-muted-foreground flex h-7 w-full items-center gap-2 rounded-md px-3 text-left text-[13px] [&_svg:not([class*='size-'])]:size-3.5 [&_svg]:shrink-0 [&_svg]:opacity-70",
        className
      )}
    >
      {children}
    </div>
  );
};
