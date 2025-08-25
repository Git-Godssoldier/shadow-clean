import { useQuery } from "@tanstack/react-query";

export type IndexingStatus =
  | "not-started"
  | "indexing"
  | "completed"
  | "failed";

export interface IndexingStatusResponse {
  status: IndexingStatus;
  lastIndexedAt?: string | null;
  lastCommitSha?: string | null;
}

export function useIndexingStatus(repoFullName: string) {
  return useQuery<IndexingStatusResponse>({
    queryKey: ["indexing-status", repoFullName],
    queryFn: async () => {
      const response = await fetch(
        `/api/indexing-status/${encodeURIComponent(repoFullName)}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch indexing status");
      }

      return response.json();
    },
    refetchInterval: (query) => {
      // Poll every 2 seconds while indexing, stop when completed/failed
      return query.state.data?.status === "indexing" ? 2000 : false;
    },
    staleTime: 30000, // Cache completed status for 30 seconds
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    retry: 3, // Retry failed requests
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
  });
}
