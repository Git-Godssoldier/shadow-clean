import {
  AlertCircle,
  Archive,
  CheckCircle2,
  CircleDashed,
  PlayCircle,
  StopCircle,
} from "lucide-react";
import {
  type TaskWithInitFields,
  isInitializationFailed,
  isInitializationInProgress,
  type TaskStatus,
} from "@repo/types";

export type { TaskStatus };

export const statusOrder = {
  RUNNING: 0,
  COMPLETED: 1,
  INITIALIZING: 2,
  STOPPED: 3,
  FAILED: 4,
  ARCHIVED: 5,
};

// Status icons and colors
export const statusColorsConfig = {
  COMPLETED: {
    icon: CheckCircle2,
    className: "text-green-400",
    bg: "bg-green-400",
  },
  STOPPED: {
    icon: StopCircle,
    className: "text-orange-400",
    bg: "bg-orange-400",
  },
  RUNNING: { icon: PlayCircle, className: "text-blue-400", bg: "bg-blue-400" },
  INITIALIZING: {
    icon: CircleDashed,
    className: "text-yellow-600",
    bg: "bg-yellow-600",
  },
  FAILED: {
    icon: AlertCircle,
    className: "text-destructive",
    bg: "bg-destructive",
  },
  ARCHIVED: {
    icon: Archive,
    className: "text-muted-foreground",
    bg: "bg-muted-foreground",
  },
};

/**
 * Get display status for task (for icon/color selection)
 */
export function getDisplayStatus(task: TaskWithInitFields): TaskStatus {
  if (isInitializationFailed(task)) return "FAILED";
  if (isInitializationInProgress(task)) return "INITIALIZING";
  return task.status || "STOPPED";
}
