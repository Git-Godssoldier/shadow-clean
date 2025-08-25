"use client";

import "../messages/messages.css";
import { Button } from "@/components/ui/button";
import { ArrowUp, Folder, GitBranch } from "lucide-react";

export function LandingPagePromptForm() {
  return (
    <>
      <div className="relative z-0 flex w-full flex-col">
        <div className="shadow-highlight/10 user-message-border relative z-0 rounded-[calc(var(--radius)+1px)] p-px shadow-lg transition-all">
          <div className="bg-background absolute inset-px -z-10 rounded-[calc(var(--radius)+1px)]" />
          <div className="absolute inset-0 -z-20 overflow-hidden rounded-[calc(var(--radius)+1px)]">
            <div className="new-task-pulse rotate-right absolute left-1/2 top-1/2 aspect-square w-[110%] -translate-x-1/2 -translate-y-1/2"></div>
            <div className="new-task-pulse rotate-left absolute left-1/2 top-1/2 aspect-square w-[110%] -translate-x-1/2 -translate-y-1/2"></div>
          </div>

          <div className="from-card/10 to-card relative flex min-h-24 flex-col rounded-lg bg-gradient-to-t">
            <div className="bg-background absolute inset-0 -z-20 rounded-[calc(var(--radius)+1px)]" />
            <div className="text-muted-foreground/50 h-16 w-full select-none px-3 py-2 text-sm">
              Build features, fix bugs, and understand codebases...
            </div>

            <div className="flex items-center justify-between gap-2 p-2">
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground hover:bg-accent px-2 font-normal"
                tabIndex={-1}
              >
                <span>GPT-5</span>
              </Button>

              <div className="flex items-center gap-2 overflow-hidden">
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:bg-accent shrink overflow-hidden font-normal"
                  tabIndex={-1}
                >
                  <Folder className="size-4" />
                  <span className="truncate">organization/repository</span>
                  <GitBranch className="size-4" />
                  <span title="main">main</span>
                </Button>
                <div className="flex items-center gap-2">
                  <Button size="iconSm" className="rounded-full" tabIndex={-1}>
                    <ArrowUp className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
