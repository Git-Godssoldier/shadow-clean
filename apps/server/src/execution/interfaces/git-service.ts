import { GitUser } from "../../services/git-manager";
import {
  GitStatusResponse,
  GitCommitResponse,
  GitPushResponse,
  GitConfigResponse,
} from "@repo/types";

/**
 * Git operations interface that abstracts local and remote execution modes
 * Provides consistent git operations regardless of execution environment
 */
export interface GitService {
  /**
   * Check if there are uncommitted changes in the workspace
   */
  hasChanges(): Promise<boolean>;

  /**
   * Get the current commit SHA
   */
  getCurrentCommitSha(): Promise<string>;

  /**
   * Get the current branch name
   */
  getCurrentBranch(): Promise<string>;

  /**
   * Create and checkout a shadow branch from base branch
   * @param baseBranch - The base branch to branch from
   * @param shadowBranch - The shadow branch name to create
   * @returns Base commit SHA
   */
  createShadowBranch(baseBranch: string, shadowBranch: string): Promise<string>;

  /**
   * Commit changes with author and co-author
   */
  commitChanges(options: {
    user: GitUser;
    coAuthor: GitUser;
    message: string;
  }): Promise<GitCommitResponse>;

  /**
   * Push branch to remote repository
   * @param branchName - Branch to push
   * @param setUpstream - Whether to set upstream tracking
   */
  pushBranch(
    branchName: string,
    setUpstream?: boolean
  ): Promise<GitPushResponse>;

  /**
   * Get git diff of current changes
   */
  getDiff(): Promise<string>;

  /**
   * Get git diff against a base branch
   */
  getDiffAgainstBase(baseBranch: string): Promise<string>;

  /**
   * Safely checkout to a specific commit SHA
   * @param commitSha - Commit SHA to checkout
   * @returns Success status
   */
  safeCheckoutCommit(commitSha: string): Promise<boolean>;

  /**
   * Configure git user for commits
   */
  configureGitUser(user: GitUser): Promise<GitConfigResponse>;

  /**
   * Get git status information
   */
  getGitStatus(): Promise<GitStatusResponse>;

  /**
   * Get recent commit messages from current branch compared to base branch
   * @param baseBranch - The base branch to compare against
   * @param limit - Maximum number of commit messages to return (default: 5)
   */
  getRecentCommitMessages(
    baseBranch: string,
    limit?: number
  ): Promise<string[]>;

  /**
   * Get file changes since base branch
   * @param baseBranch - Base branch to compare against (default: "main")
   */
  getFileChanges(baseBranch?: string): Promise<{
    fileChanges: FileChange[];
    diffStats: DiffStats;
  }>;
}

export interface FileChange {
  filePath: string;
  operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
  additions: number;
  deletions: number;
  createdAt: string;
}

export interface DiffStats {
  additions: number;
  deletions: number;
  totalFiles: number;
}

export interface GitFileChangesError {
  code:
    | "NO_GIT_REPO"
    | "WORKSPACE_NOT_FOUND"
    | "COMMAND_FAILED"
    | "NETWORK_ERROR"
    | "UNKNOWN";
  message: string;
  details?: string;
}

export interface GitFileChangesResult {
  success: boolean;
  fileChanges: FileChange[];
  diffStats: DiffStats;
  error?: GitFileChangesError;
}
