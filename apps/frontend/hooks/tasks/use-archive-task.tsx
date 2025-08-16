import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Task } from "@repo/db";

export function useArchiveTask() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const response = await fetch(`/api/tasks/${taskId}/archive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to archive task");
      }

      return response.json();
    },
    onMutate: async (taskId: string) => {
      await queryClient.cancelQueries({ queryKey: ["tasks"] });

      const previousTasks = queryClient.getQueryData<Task[]>(["tasks"]);

      queryClient.setQueryData<Task[]>(["tasks"], (oldTasks) => {
        if (!oldTasks) return oldTasks;

        return oldTasks.map((task) =>
          task.id === taskId ? { ...task, status: "ARCHIVED" as const } : task
        );
      });

      return { previousTasks };
    },
    onError: (_err, _taskId, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["tasks"], context.previousTasks);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}
