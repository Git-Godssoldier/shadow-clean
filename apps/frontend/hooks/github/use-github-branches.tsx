import { fetchGitHubBranches } from "@/lib/github/fetch";
import { useQuery } from "@tanstack/react-query";

export function useGitHubBranches(
  repoFullName: string | null,
  enabled: boolean = true
) {
  return useQuery({
    queryKey: ["github", "branches", repoFullName],
    queryFn: () => {
      if (!repoFullName) {
        throw new Error("Repository full name is required");
      }
      return fetchGitHubBranches(repoFullName);
    },
    throwOnError: false, // Don't throw on error - let component handle error states
    enabled: !!repoFullName && enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    retry: (failureCount, error) => {
      // Don't retry on auth errors (401, 403) - these need user action
      if (error instanceof Error && error.message.includes("401")) {
        return false;
      }
      if (error instanceof Error && error.message.includes("403")) {
        return false;
      }
      // Don't retry on invalid repo format
      if (
        error instanceof Error &&
        error.message.includes("Repository full name is required")
      ) {
        return false;
      }
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
  });
}
