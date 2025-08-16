import { Message } from "@repo/types";
import { useQuery, isCancelledError } from "@tanstack/react-query";

export function useTaskMessages(taskId: string) {
  const query = useQuery({
    queryKey: ["task-messages", taskId],
    queryFn: async ({ signal }): Promise<Message[]> => {
      const res = await fetch(`/api/tasks/${taskId}/messages`, { signal });
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();

      return data;
    },
    // Do not surface cancellations as runtime errors in the UI
    throwOnError: (error) => !isCancelledError(error),
    enabled: !!taskId,
  });

  return query;
}
