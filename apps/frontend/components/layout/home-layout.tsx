"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { NewTaskAnimation } from "../task/new-task-animation";

export function HomeLayoutWrapper({ children }: { children: React.ReactNode }) {
  const { open } = useSidebar();

  return (
    <div className="relative flex size-full h-svh flex-col items-center overflow-hidden">
      <NewTaskAnimation />
      <div className="bg-background sticky top-0 z-10 flex w-full items-center justify-between p-3">
        {!open ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarTrigger />
            </TooltipTrigger>
            <TooltipContent side="right" shortcut="⌘B">
              {open ? "Close Sidebar" : "Open Sidebar"}
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="size-7" />
        )}
      </div>
      {children}
    </div>
  );
}
