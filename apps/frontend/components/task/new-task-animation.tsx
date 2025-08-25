import { cn } from "@/lib/utils";
import "./new-task-animation.css";

export function NewTaskAnimation({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "bg-muted new-task-animation absolute top-40 -z-10 h-[calc(100svh-12rem)] w-full max-w-5xl rounded-[50%]",
        className
      )}
    ></div>
  );
}
