import type { Message } from "@repo/types";
import { Brain } from "lucide-react";
import { getToolResult, ToolTypes } from "@repo/types";
import { ToolComponent } from "./tool";

export function ListMemoriesTool({ message }: { message: Message }) {
  const toolMeta = message.metadata?.tool;
  if (!toolMeta) return null;

  const { args, status } = toolMeta;
  const category = args.category as string | undefined;
  const result = getToolResult(toolMeta, "list_memories");

  const title = category
    ? `${category.toLowerCase()} memories`
    : "all memories";

  return (
    <ToolComponent
      icon={<Brain />}
      type={ToolTypes.LIST_MEMORIES}
      title={title}
      collapsible
    >
      {status === "COMPLETED" && result && (
        <div className="text-[13px]">
          {result.success ? (
            result.memories && result.memories.length > 0 ? (
              <div className="space-y-3">
                {result.memoriesByCategory ? (
                  Object.entries(result.memoriesByCategory).map(
                    ([cat, memories]) => (
                      <div key={cat} className="space-y-1">
                        <div className="text-muted-foreground text-xs font-medium uppercase">
                          {cat}
                        </div>
                        <ul className="ml-4 list-disc space-y-1">
                          {memories.map((m) => (
                            <li key={m.id} className="text-xs">
                              {m.content}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )
                  )
                ) : (
                  <ul className="ml-4 list-disc space-y-1">
                    {result.memories.map((m) => (
                      <li key={m.id} className="text-xs">
                        {m.content}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="text-muted-foreground text-xs">
                No memories found
              </div>
            )
          ) : (
            <div className="text-destructive text-xs">
              Error: {result.error}
            </div>
          )}
        </div>
      )}
    </ToolComponent>
  );
}
