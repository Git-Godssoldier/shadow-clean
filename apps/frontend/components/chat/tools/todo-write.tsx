import type { Message } from "@repo/types";
import {
  Check,
  CheckSquare2,
  CircleDashed,
  ListTodo,
  Square,
  SquareX,
} from "lucide-react";
import { ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";
import { cn } from "@/lib/utils";

interface TodoItem {
  id: string;
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

function StatusIcon({ status }: { status: TodoItem["status"] }) {
  switch (status) {
    case "pending":
      return <Square className="size-4 shrink-0" />;
    case "in_progress":
      return (
        <CircleDashed className="animation-duration-[5s] size-4 animate-spin" />
      );
    case "completed":
      return <CheckSquare2 className="size-4 shrink-0" />;
    case "cancelled":
      return <SquareX className="text-destructive size-4 shrink-0" />;
  }
}

function TodoList({ todos }: { todos: TodoItem[] }) {
  const _statusCounts = todos.reduce(
    (acc, todo) => {
      acc[todo.status] = (acc[todo.status] || 0) + 1;
      return acc;
    },
    {} as Record<TodoItem["status"], number>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 pb-1.5">
        {todos.map((todo) => (
          <div key={todo.id} className="flex min-h-5 items-start gap-1.5 pt-1">
            <StatusIcon status={todo.status} />
            <div
              className={cn(
                "line-clamp-2 leading-4",
                todo.status === "completed"
                  ? "line-through"
                  : todo.status === "cancelled"
                    ? "text-destructive/70 line-through"
                    : ""
              )}
            >
              {todo.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TodoWriteTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, result } = toolMeta;
  const merge = args.merge as boolean;
  const todos = args.todos as TodoItem[];

  // Parse result to get totalTodos for merge operations
  let parsedResult;
  try {
    parsedResult = typeof result === "string" ? JSON.parse(result) : result;
  } catch {
    parsedResult = null;
  }

  const lastTodo = todos[todos.length - 1];

  const icon =
    lastTodo?.status === "in_progress" ? (
      <CircleDashed className="animation-duration-[5s] size-4 animate-spin" />
    ) : lastTodo?.status === "completed" ? (
      <Check />
    ) : (
      <ListTodo />
    );

  const prefix = merge
    ? lastTodo?.status === "in_progress"
      ? "In progress:"
      : lastTodo?.status === "completed"
        ? "Completed:"
        : "Updated todo list"
    : "Created todo list";

  const progress = parsedResult?.totalTodos
    ? merge
      ? `(${parsedResult.completedTodos ?? todos.filter((t) => t.status === "completed").length}/${parsedResult.totalTodos})`
      : `${parsedResult.totalTodos} item${parsedResult.totalTodos === 1 ? "" : "s"}`
    : "";

  const title =
    lastTodo?.status === "in_progress" || lastTodo?.status === "completed"
      ? `${lastTodo?.content} ${progress}`
      : progress;

  return (
    <ToolComponent
      icon={icon}
      type={ToolTypes.TODO_WRITE}
      title={title}
      prefix={prefix}
      collapsible
    >
      <TodoList todos={todos} />
    </ToolComponent>
  );
}
