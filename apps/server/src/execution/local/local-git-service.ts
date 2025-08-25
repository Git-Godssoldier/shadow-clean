import { GitService, FileChange, DiffStats } from "../interfaces/git-service";
import { GitManager, GitUser } from "../../services/git-manager";
import { TaskModelContext } from "../../services/task-model-context";
import {
  GitStatusResponse,
  GitCommitResponse,
  GitPushResponse,
  GitConfigResponse,
} from "@repo/types";
import { getFileChangesForWorkspace } from "../../utils/git-operations";

/**
 * LocalGitService wraps GitManager to provide unified git operations interface
 * for local execution mode
 */
export class LocalGitService implements GitService {
  constructor(private gitManager: GitManager) {}

  async hasChanges(): Promise<boolean> {
    return this.gitManager.hasChanges();
  }

  async getCurrentCommitSha(): Promise<string> {
    return this.gitManager.getCurrentCommitSha();
  }

  async getCurrentBranch(): Promise<string> {
    return this.gitManager.getCurrentBranch();
  }

  async createShadowBranch(
    baseBranch: string,
    shadowBranch: string
  ): Promise<string> {
    return this.gitManager.createShadowBranch(baseBranch, shadowBranch);
  }

  async commitChanges(options: {
    user: GitUser;
    coAuthor: GitUser;
    message: string;
  }): Promise<GitCommitResponse> {
    try {
      // Create a minimal context for commit operations
      const minimalContext = {
        getProvider: () => "anthropic" as const,
        validateAccess: () => true,
      } as TaskModelContext;

      const commitSha = await this.gitManager.commitChanges({
        user: options.user,
        coAuthor: options.coAuthor,
        context: minimalContext,
        message: options.message,
      });

      return {
        success: true,
        message: `Committed changes: "${options.message}"`,
        commitMessage: options.message,
        commitSha,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Commit failed",
        error: "COMMIT_FAILED",
      };
    }
  }

  async pushBranch(
    branchName: string,
    setUpstream = false
  ): Promise<GitPushResponse> {
    try {
      await this.gitManager.pushBranch(branchName, setUpstream);
      return {
        success: true,
        message: `Successfully pushed branch: ${branchName}`,
        branchName,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Push failed",
        error: "PUSH_FAILED",
        branchName,
      };
    }
  }

  async getDiff(): Promise<string> {
    return this.gitManager.getDiff();
  }

  async getDiffAgainstBase(baseBranch: string): Promise<string> {
    return this.gitManager.getDiffAgainstBase(baseBranch);
  }

  async safeCheckoutCommit(commitSha: string): Promise<boolean> {
    return this.gitManager.safeCheckoutCommit(commitSha);
  }

  async configureGitUser(user: GitUser): Promise<GitConfigResponse> {
    try {
      await this.gitManager.configureGitUser(user);
      return {
        success: true,
        message: `Configured git user: ${user.name} <${user.email}>`,
        user,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Git config failed",
        error: "CONFIG_FAILED",
      };
    }
  }

  async getGitStatus(): Promise<GitStatusResponse> {
    try {
      const hasChanges = await this.gitManager.hasChanges();
      return {
        success: true,
        hasChanges,
        message: hasChanges ? "Workspace has changes" : "Workspace is clean",
      };
    } catch (error) {
      return {
        success: false,
        hasChanges: false,
        message: error instanceof Error ? error.message : "Git status failed",
        error: "STATUS_FAILED",
      };
    }
  }

  async getRecentCommitMessages(
    baseBranch: string,
    limit = 5
  ): Promise<string[]> {
    try {
      // Use the same logic that was in PRManager but through GitManager's execGit method
      const { stdout } = await this.gitManager.execGit(
        `log ${baseBranch}..HEAD --oneline -${limit} --pretty=format:"%s"`
      );
      return stdout.trim().split("\n").filter(Boolean);
    } catch (error) {
      console.warn(
        `[LOCAL_GIT_SERVICE] Failed to get recent commit messages:`,
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
      // Use the workspace-path agnostic utility function
      return await getFileChangesForWorkspace(
        this.gitManager.getWorkspacePath(),
        baseBranch
      );
    } catch (error) {
      const isGitError =
        error instanceof Error &&
        (error.message.includes("not a git repository") ||
          error.message.includes("git"));
      const isFileSystemError =
        error instanceof Error &&
        (error.message.includes("ENOENT") ||
          error.message.includes("no such file"));

      const errorCode = isGitError
        ? "NO_GIT_REPO"
        : isFileSystemError
          ? "WORKSPACE_NOT_FOUND"
          : "COMMAND_FAILED";

      console.error(`[LOCAL_GIT_SERVICE] Failed to get file changes:`, {
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
