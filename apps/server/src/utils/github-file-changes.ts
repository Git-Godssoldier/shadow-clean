import { GitHubApiClient } from "../github/github-api";
import type {
  FileChange,
  DiffStats,
} from "../execution/interfaces/git-service";

/**
 * Get file changes for a task using GitHub API (for INACTIVE tasks)
 */
export async function getGitHubFileChanges(
  repoFullName: string,
  baseBranch: string,
  shadowBranch: string,
  userId: string
): Promise<{ fileChanges: FileChange[]; diffStats: DiffStats }> {
  const startTime = Date.now();
  const apiClient = new GitHubApiClient();

  try {
    const compareResult = await apiClient.compareBranches(
      repoFullName,
      `${baseBranch}...${shadowBranch}`,
      userId
    );

    const now = new Date().toISOString();

    // Convert GitHub file changes to our FileChange format
    const fileChanges: FileChange[] = compareResult.files.map((file) => {
      return {
        filePath: file.filename,
        operation: mapGitHubStatusToOperation(file.status),
        additions: file.additions,
        deletions: file.deletions,
        createdAt: now,
      };
    });

    const diffStats: DiffStats = {
      additions: compareResult.stats.additions,
      deletions: compareResult.stats.deletions,
      totalFiles: compareResult.stats.total,
    };

    return { fileChanges, diffStats };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(
      `[FILE_CHANGES_DEBUG] GitHub API error (duration: ${duration}ms) - repo: ${repoFullName}, comparison: ${baseBranch}...${shadowBranch}:`,
      error
    );

    // Return empty changes on error (graceful degradation)
    return {
      fileChanges: [],
      diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
    };
  }
}

/**
 * Map GitHub file status to our operation types
 */
function mapGitHubStatusToOperation(status: string): FileChange["operation"] {
  switch (status) {
    case "added":
      return "CREATE";
    case "modified":
      return "UPDATE";
    case "removed":
      return "DELETE";
    case "renamed":
      return "RENAME";
    default:
      return "UPDATE"; // Default to update for unknown status
  }
}
