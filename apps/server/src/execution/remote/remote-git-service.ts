import { GitService, FileChange, DiffStats } from "../interfaces/git-service";
import { RemoteToolExecutor } from "./remote-tool-executor";
import { GitUser } from "../../services/git-manager";
import {
  GitStatusResponse,
  GitCommitResponse,
  GitPushResponse,
  GitConfigResponse,
} from "@repo/types";

/**
 * RemoteGitService wraps RemoteToolExecutor to provide unified git operations interface
 * for remote execution mode
 */
export class RemoteGitService implements GitService {
  constructor(private toolExecutor: RemoteToolExecutor) {}

  async hasChanges(): Promise<boolean> {
    const status = await this.toolExecutor.getGitStatus();
    return status.success ? status.hasChanges : false;
  }

  async getCurrentCommitSha(): Promise<string> {
    const result = await this.toolExecutor.getCurrentCommitSha();
    if (!result.success || !result.commitSha) {
      throw new Error(result.message || "Failed to get commit SHA");
    }
    return result.commitSha;
  }

  async getCurrentBranch(): Promise<string> {
    const result = await this.toolExecutor.getCurrentBranch();
    if (!result.success || !result.currentBranch) {
      throw new Error(result.message || "Failed to get current branch");
    }
    return result.currentBranch;
  }

  async createShadowBranch(
    baseBranch: string,
    shadowBranch: string
  ): Promise<string> {
    const result = await this.toolExecutor.createShadowBranch(
      baseBranch,
      shadowBranch
    );
    if (!result.success) {
      throw new Error(result.message || "Failed to create shadow branch");
    }
    return result.baseCommitSha || "HEAD";
  }

  async commitChanges(options: {
    user: GitUser;
    coAuthor: GitUser;
    message: string;
  }): Promise<GitCommitResponse> {
    return this.toolExecutor.commitChanges({
      user: options.user,
      coAuthor: options.coAuthor,
      message: options.message,
    });
  }

  async pushBranch(
    branchName: string,
    setUpstream = false
  ): Promise<GitPushResponse> {
    return this.toolExecutor.pushBranch({
      branchName,
      setUpstream,
    });
  }

  async getDiff(): Promise<string> {
    const result = await this.toolExecutor.getGitDiff();
    return result.success ? result.diff : "";
  }

  async getDiffAgainstBase(baseBranch: string): Promise<string> {
    const result = await this.toolExecutor.getDiffAgainstBase(baseBranch);
    return result.success ? result.diff : "";
  }

  async safeCheckoutCommit(commitSha: string): Promise<boolean> {
    const result = await this.toolExecutor.safeCheckoutCommit(commitSha);
    return result.success;
  }

  async configureGitUser(user: GitUser): Promise<GitConfigResponse> {
    return this.toolExecutor.configureGitUser(user);
  }

  async getGitStatus(): Promise<GitStatusResponse> {
    return this.toolExecutor.getGitStatus();
  }

  async getRecentCommitMessages(
    baseBranch: string,
    limit = 5
  ): Promise<string[]> {
    try {
      const result = await this.toolExecutor.getRecentCommitMessages(
        baseBranch,
        limit
      );
      return result.success ? result.commitMessages || [] : [];
    } catch (error) {
      console.warn(
        `[REMOTE_GIT_SERVICE] Failed to get recent commit messages:`,
        error
      );
      return [];
    }
  }

  async getFileChanges(baseBranch: string = "main"): Promise<{
    fileChanges: FileChange[];
    diffStats: DiffStats;
  }> {
    try {
      // Use the new sidecar API endpoint
      const response = await this.toolExecutor.makeSidecarRequest<{
        success: boolean;
        fileChanges: FileChange[];
        diffStats: DiffStats;
        message?: string;
        error?: string;
      }>(
        "/api/git/file-changes",
        {
          method: "POST",
          body: JSON.stringify({ baseBranch }),
        }
      );

      if (response.success) {
        return {
          fileChanges: response.fileChanges,
          diffStats: response.diffStats,
        };
      } else {
        const errorCode =
          response.error === "FILE_CHANGES_FAILED"
            ? "COMMAND_FAILED"
            : "UNKNOWN";
        console.error(`[REMOTE_GIT_SERVICE] Sidecar file changes API failed:`, {
          code: errorCode,
          message: response.message,
          error: response.error,
        });
        return {
          fileChanges: [],
          diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
        };
      }
    } catch (error) {
      const isNetworkError =
        error instanceof Error &&
        (error.message.includes("fetch") ||
          error.message.includes("ECONNREFUSED"));
      const errorCode = isNetworkError ? "NETWORK_ERROR" : "UNKNOWN";

      console.error(`[REMOTE_GIT_SERVICE] Failed to get file changes:`, {
        code: errorCode,
        message: error instanceof Error ? error.message : "Unknown error",
        details: String(error),
      });

      return {
        fileChanges: [],
        diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
      };
    }
  }
}
