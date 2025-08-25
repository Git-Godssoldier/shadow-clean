import Link from "next/link";
import { Circle, GitBranchPlus } from "lucide-react";
import { Card } from "../../ui/card";
import { useStackedPRInfo } from "@/hooks/chat/use-stacked-pr-info";
import { statusColorsConfig, type TaskStatus } from "../../sidebar/status";
import { cn } from "@/lib/utils";

type StackedTask = {
  id: string;
  title: string;
  shadowBranch?: string;
};

export function StackedPRCard({ stackedTask }: { stackedTask: StackedTask }) {
  const { data: stackedPRInfo, isLoading } = useStackedPRInfo(
    stackedTask.id,
    stackedTask
  );

  const status: TaskStatus = (stackedPRInfo?.status as TaskStatus) || "INITIALIZING";
  const title = stackedPRInfo?.title || stackedTask.title;
  const shadowBranch = stackedPRInfo?.shadowBranch || stackedTask.shadowBranch;

  // Cast status to keyof typeof statusColorsConfig to fix type issue
  const statusConfig = statusColorsConfig[status as keyof typeof statusColorsConfig];
  const StatusIcon = statusConfig.icon;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-muted-foreground px-3 text-[13px]">
        Stacked Task Branch Created
      </div>
      <Link href={`/tasks/${stackedTask.id}`} target="_blank">
        <Card className="hover:bg-card/70 gap-1.5 rounded-lg p-3 text-left">
          <div className="truncate font-medium leading-tight">{title}</div>

          <div className="text-muted-foreground flex items-center gap-1.5 text-[13px]">
            <div className="flex items-center gap-1.5">
              <StatusIcon
                className={cn("size-3.5 shrink-0", statusConfig.className, {
                  "animate-spin": isLoading && status === "INITIALIZING",
                })}
              />
              <span className="capitalize">
                {status.toLowerCase().replace("_", " ")}
              </span>
            </div>

            {shadowBranch && (
              <>
                <Circle className="fill-muted-foreground size-1 shrink-0 opacity-50" />
                <GitBranchPlus className="size-3.5 shrink-0" />

                <span className="truncate">{shadowBranch}</span>
              </>
            )}
          </div>
        </Card>
      </Link>
    </div>
  );
}
