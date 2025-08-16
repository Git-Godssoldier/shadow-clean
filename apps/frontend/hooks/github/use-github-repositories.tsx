import { fetchGitHubRepositories } from "@/lib/github/fetch";
import { useQuery } from "@tanstack/react-query";

export function useGitHubRepositories(enabled: boolean = true) {
  return useQuery({
    queryKey: ["github", "repositories"],
    queryFn: fetchGitHubRepositories,
    throwOnError: false, // Don't throw on error - let component handle error states
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on auth errors (401, 403) - these need user action
      if (error instanceof Error && error.message.includes("401")) {
        return false;
      }
      if (error instanceof Error && error.message.includes("403")) {
        return false;
      }
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
  });
}
