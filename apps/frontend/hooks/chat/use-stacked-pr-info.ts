import { useQuery } from "@tanstack/react-query";
import type { StackedPRInfo } from "@/lib/db-operations/get-stacked-pr-info";
import type { TaskStatus } from "@repo/types";

type InitialStackedPRData = {
  id: string;
  title: string;
  shadowBranch?: string;
  status?: TaskStatus;
};

export function useStackedPRInfo(
  taskId: string,
  initialData?: InitialStackedPRData
) {
  return useQuery<StackedPRInfo>({
    queryKey: ["stacked-pr-info", taskId],
    queryFn: async () => {
      const response = await fetch(`/api/tasks/${taskId}/stacked-pr-info`);
      if (!response.ok) {
        throw new Error("Failed to fetch stacked PR info");
      }
      return response.json();
    },
    initialData: initialData
      ? {
          id: initialData.id,
          title: initialData.title,
          status: initialData.status || "INITIALIZING",
          shadowBranch: initialData.shadowBranch || null,
        }
      : undefined,
    refetchInterval: 15000, // Refetch every 15 seconds
    staleTime: 10000, // Consider data stale after 10 seconds
    refetchOnWindowFocus: true, // Refetch when window gains focus
  });
}
