"use client";

import { Folder, BookOpen, AlertTriangle } from "lucide-react";
import { useMemo } from "react";
import { FileIcon } from "@/components/ui/file-icon";
import { useCodebase } from "@/hooks/use-codebase";
import { CodebaseSummary } from "@repo/types";
import { Separator } from "../ui/separator";
import { useParams } from "next/navigation";
import { useModal } from "../layout/modal-context";
import { LogoHover } from "../graphics/logo/logo-hover";
import { MemoizedMarkdown } from "../chat/markdown/memoized-markdown";
import { Card } from "../ui/card";

export function ShadowWikiContent() {
  const { taskId } = useParams<{ taskId: string }>();
  const { data: codebase, isLoading, error } = useCodebase(taskId);
  const summaries = useMemo(() => codebase?.summaries || [], [codebase]);

  const { openSettingsModal } = useModal();

  // Organize summaries by type
  const { repoSummaries, fileSummaries, directorySummaries } = useMemo(() => {
    const repoSummaries = summaries.filter((s: CodebaseSummary) => s.type === "repo_summary");
    const fileSummaries = summaries.filter((s: CodebaseSummary) => s.type === "file_summary");
    const directorySummaries = summaries.filter(
      (s: CodebaseSummary) => s.type === "directory_summary"
    );
    return { repoSummaries, fileSummaries, directorySummaries };
  }, [summaries]);

  // Find the main overview
  const overview =
    repoSummaries.find(
      (s: CodebaseSummary) =>
        s.filePath === "root_overview" ||
        (s.filePath?.toLowerCase().includes("root") &&
          s.filePath?.toLowerCase().includes("overview"))
    ) || repoSummaries[0];

  if (isLoading)
    return (
      <div className="break-works flex size-full items-center justify-center gap-2 overflow-y-auto p-4">
        <LogoHover size="sm" forceAnimate className="opacity-60" />
        <span className="font-departureMono">Loading Opulent OS Wiki</span>
      </div>
    );
  if (error)
    return (
      <div className="break-works flex size-full items-center justify-center gap-2 overflow-y-auto p-4 leading-none">
        <AlertTriangle className="text-destructive size-4 shrink-0" />
        Error loading Opulent OS Wiki: {error.message || "Unknown error"}
      </div>
    );

  if (!codebase) {
    return (
      <div className="flex size-full overflow-y-auto p-4">
        <div className="mx-auto flex size-full max-w-xs flex-col items-center justify-center gap-2 text-center">
          <BookOpen className="size-6 shrink-0" />
          <div className="mb-2 font-medium">No Opulent OS Wiki Found</div>
          <div className="text-muted-foreground text-[13px] leading-tight">
            Opulent OS Wiki is a codebase understanding service to generate
            summaries for the agent&apos;s initial context for new tasks.
          </div>
          <div className="text-muted-foreground text-[13px] leading-tight">
            Manage auto-generation in{" "}
            <button
              type="button"
              onClick={() => {
                openSettingsModal("user");
              }}
              className="text-foreground inline-block cursor-pointer font-medium hover:underline hover:opacity-90"
            >
              settings
            </button>
            .
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative z-0 flex size-full flex-col items-center overflow-y-auto p-4">
      {overview && (
        <div id={overview.id} className="flex w-full flex-col gap-0">
          <MemoizedMarkdown
            content={`# Codebase Overview\n\n${overview.content.trim()}`}
            id={overview.id}
          />
        </div>
      )}

      {/* Files */}
      {fileSummaries.length > 0 && (
        <>
          <Separator className="my-8" />
          <div id="files" className="flex max-w-full flex-col gap-6">
            <div className="text-xl font-medium">Files</div>
            {fileSummaries.map((file: CodebaseSummary) => (
              <div key={file.id} id={file.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <FileIcon
                    filename={file.filePath || ""}
                    className="size-3.5 shrink-0"
                    useFallback
                  />
                  <div className="text-sm font-medium">{file.filePath}</div>
                </div>
                <Card className="overflow-x-auto rounded-lg p-3">
                  <MemoizedMarkdown content={file.content} id={file.id} />
                </Card>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Directories */}
      {directorySummaries.length > 0 && (
        <>
          <Separator className="my-8" />
          <div id="directories" className="flex max-w-full flex-col gap-6">
            <div className="text-xl font-medium">Directories</div>
            {directorySummaries.map((directory: CodebaseSummary) => (
              <div
                key={directory.id}
                id={directory.id}
                className="flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <Folder className="size-3.5 shrink-0" />
                  <div className="text-sm font-medium">
                    {directory.filePath}
                  </div>
                </div>
                <Card className="overflow-x-auto rounded-lg p-3">
                  <MemoizedMarkdown
                    content={directory.content}
                    id={directory.id}
                  />
                </Card>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
