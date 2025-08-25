"use client";

import { useEffect, useState, useMemo } from "react";
import { transformerNotationDiff } from "@shikijs/transformers";
import { BundledLanguage } from "shiki";
import { getHighlighter } from "@/lib/editor/highlighter";
import { cn } from "@/lib/utils";
import { ChevronDown, Expand, Loader2 } from "lucide-react";
import { Button } from "./button";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

export function ShikiDiff({
  content,
  language,
  className,
  onExpand,
}: {
  content: string;
  language: BundledLanguage;
  className?: string;
  onExpand?: () => void;
}) {
  const [html, setHtml] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  // Memoize the content and language to avoid unnecessary re-renders
  const memoizedContent = useMemo(() => content, [content]);
  const memoizedLanguage = useMemo(() => language, [language]);

  useEffect(() => {
    async function generateHighlightedCode() {
      try {
        setIsLoading(true);
        setError("");

        const highlighter = await getHighlighter();

        const highlightedHtml = highlighter.codeToHtml(memoizedContent, {
          lang: memoizedLanguage,
          theme: "vesper",
          transformers: [
            transformerNotationDiff({
              matchAlgorithm: "v3", // Use the newer matching algorithm
            }),
          ],
        });

        setHtml(highlightedHtml);
      } catch (err) {
        console.error("Failed to highlight code:", err);
        setError(
          err instanceof Error ? err.message : "Failed to highlight code"
        );
        // Fallback to plain text
        setHtml(`<pre><code>${escapeHtml(memoizedContent)}</code></pre>`);
      } finally {
        setIsLoading(false);
      }
    }

    if (memoizedContent) {
      generateHighlightedCode();
    }
  }, [memoizedContent, memoizedLanguage]);

  if (isLoading) {
    return (
      <div
        className={cn(
          "border-border not-prose flex items-center justify-center overflow-auto rounded-md border p-6",
          className
        )}
      >
        <Loader2 className="size-4 animate-spin" />
      </div>
    );
  }

  if (error) {
    return null;
  }

  return (
    <div className="relative z-0 overflow-hidden rounded-md border py-2 font-mono text-xs">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="iconXs"
            className="text-muted-foreground hover:text-foreground absolute right-1.5 top-1.5 z-10"
            onClick={onExpand}
          >
            <Expand className="size-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="top" align="end">
          Open In Editor
        </TooltipContent>
      </Tooltip>
      <div
        className={cn(
          "shiki-diff-container not-prose overflow-auto",
          "[&_.diff.add]:inline-block [&_.diff.add]:min-w-full [&_.diff.add]:bg-green-950/30",
          "[&_.diff.remove]:inline-block [&_.diff.remove]:min-w-full [&_.diff.remove]:bg-red-950/30",
          "[&_code]:relative [&_code]:border-none [&_code]:bg-transparent [&_code]:p-0",
          "[&_pre]:m-0 [&_pre]:bg-transparent",
          className
        )}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

// Utility function to escape HTML
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
