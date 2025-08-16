import { spawn } from "child_process";
import { logger } from "../utils/logger";
import { WorkspaceService } from "./workspace-service";
import {
  GitCloneResponse,
  GitConfigResponse,
  GitBranchResponse,
  GitStatusResponse,
  GitDiffResponse,
  GitCommitResponse,
  GitPushResponse,
  GitBranchInfoResponse,
  GitCommitInfoResponse,
  GitCheckoutResponse,
  GitCommitMessagesResponse,
} from "@repo/types";
import {
  validateGitOperation,
  validateGitUser,
  validateBranchName,
  logSecurityEvent,
} from "../utils/security";

export interface GitUser {
  name: string;
  email: string;
}

export interface CommitOptions {
  user: GitUser;
  coAuthor?: GitUser;
  message?: string;
}

export class GitService {
  constructor(private workspaceService: WorkspaceService) {}

  /**
   * Clone repository to workspace
   */
  async cloneRepository(
    repoUrl: string,
    branch: string,
    githubToken?: string
  ): Promise<GitCloneResponse> {
    try {
      logger.info("[GIT_SERVICE] Starting repository clone", {
        repoUrl: this.sanitizeUrl(repoUrl),
        branch,
      });

      // Ensure workspace directory exists and is clean
      await this.workspaceService.ensureWorkspace();

      // Build authenticated URL if token provided
      let cloneUrl = repoUrl;
      if (githubToken && repoUrl.includes("github.com")) {
        // Convert to authenticated HTTPS URL
        const urlParts = repoUrl
          .replace("https://github.com/", "")
          .replace(".git", "");
        cloneUrl = `https://${githubToken}@github.com/${urlParts}.git`;
      }

      await this.execGitSecure([
        "clone",
        "--branch",
        branch,
        "--single-branch",
        cloneUrl,
        ".",
      ]);

      logger.info("[GIT_SERVICE] Repository cloned successfully", {
        repoUrl: this.sanitizeUrl(repoUrl),
        branch,
      });

      return {
        success: true,
        message: `Successfully cloned repository ${repoUrl} (branch: ${branch})`,
        repoUrl,
        branch,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Repository clone failed", {
        repoUrl: this.sanitizeUrl(repoUrl),
        branch,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to clone repository: ${errorMessage}`,
        error: "CLONE_FAILED",
        repoUrl,
        branch,
      };
    }
  }

  /**
   * Configure git user for commits
   */
  async configureUser(user: GitUser): Promise<GitConfigResponse> {
    try {
      logger.info("[GIT_SERVICE] Configuring git user", {
        name: user.name,
        email: user.email,
      });

      await this.execGitSecure(["config", "user.name", user.name]);
      await this.execGitSecure(["config", "user.email", user.email]);

      return {
        success: true,
        message: `Configured git user: ${user.name} <${user.email}>`,
        user,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to configure git user", {
        user,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to configure git user: ${errorMessage}`,
        error: "CONFIG_FAILED",
        user,
      };
    }
  }

  /**
   * Create and checkout shadow branch, return base commit SHA
   */
  async createShadowBranch(
    baseBranch: string,
    shadowBranch: string
  ): Promise<GitBranchResponse> {
    try {
      logger.info("[GIT_SERVICE] Creating shadow branch", {
        baseBranch,
        shadowBranch,
      });

      // Ensure we're on the base branch first
      await this.execGitSecure(["checkout", baseBranch]);

      // Get the base commit SHA before creating the branch
      const baseCommitResult = await this.execGitSecure(["rev-parse", "HEAD"]);
      const baseCommitSha = baseCommitResult.stdout.trim();

      // Create and checkout the shadow branch
      await this.execGitSecure(["checkout", "-b", shadowBranch]);

      logger.info("[GIT_SERVICE] Shadow branch created successfully", {
        baseBranch,
        shadowBranch,
        baseCommitSha,
      });

      return {
        success: true,
        message: `Created shadow branch: ${shadowBranch} from ${baseBranch}`,
        baseBranch,
        shadowBranch,
        baseCommitSha,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to create shadow branch", {
        baseBranch,
        shadowBranch,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to create shadow branch: ${errorMessage}`,
        error: "BRANCH_FAILED",
        baseBranch,
        shadowBranch,
      };
    }
  }

  /**
   * Check if there are any uncommitted changes
   */
  async hasChanges(): Promise<GitStatusResponse> {
    try {
      const statusResult = await this.execGitSecure(["status", "--porcelain"]);

      const statusOutput = statusResult.stdout.trim();
      const hasChanges = statusOutput.length > 0;

      // Parse git status --porcelain output to categorize changes
      // Format: "XY filename" where X=index status, Y=working tree status
      let hasUnstagedChanges = false;
      let hasStagedChanges = false;

      if (hasChanges) {
        const lines = statusOutput.split("\n");
        for (const line of lines) {
          if (line.length >= 2) {
            const indexStatus = line[0];
            const workingTreeStatus = line[1];

            // Check for staged changes (index status not space or ?)
            if (indexStatus !== " " && indexStatus !== "?") {
              hasStagedChanges = true;
            }

            // Check for unstaged changes (working tree status not space)
            if (workingTreeStatus !== " ") {
              hasUnstagedChanges = true;
            }
          }
        }
      }

      logger.info("[GIT_SERVICE] Git status check completed", {
        hasChanges,
        hasUnstagedChanges,
        hasStagedChanges,
        statusOutput:
          statusOutput.substring(0, 200) +
          (statusOutput.length > 200 ? "..." : ""),
      });

      return {
        success: true,
        hasChanges,
        hasUnstagedChanges,
        hasStagedChanges,
        message: hasChanges
          ? "Workspace has uncommitted changes"
          : "No uncommitted changes found",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to check git status", {
        error: errorMessage,
      });

      return {
        success: false,
        hasChanges: false,
        message: `Failed to check git status: ${errorMessage}`,
        error: "STATUS_FAILED",
      };
    }
  }

  /**
   * Get git diff of current changes
   */
  async getDiff(): Promise<GitDiffResponse> {
    try {
      // Get both staged and unstaged changes
      const unstagedResult = await this.execGitSecure(["diff"]);
      const stagedResult = await this.execGitSecure(["diff", "--cached"]);

      const unstagedDiff = unstagedResult.stdout;
      const stagedDiff = stagedResult.stdout;
      const combinedDiff = [unstagedDiff, stagedDiff]
        .filter((diff) => diff.trim())
        .join("\n\n");

      return {
        success: true,
        diff: combinedDiff,
        unstagedDiff,
        stagedDiff,
        message: combinedDiff
          ? "Retrieved git diff successfully"
          : "No changes to diff",
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get git diff", {
        error: errorMessage,
      });

      return {
        success: false,
        diff: "",
        message: `Failed to get git diff: ${errorMessage}`,
        error: "DIFF_FAILED",
      };
    }
  }

  /**
   * Get git diff against a base branch (for PR generation)
   */
  async getDiffAgainstBase(baseBranch: string): Promise<GitDiffResponse> {
    try {
      logger.info("[GIT_SERVICE] Getting diff against base branch", {
        baseBranch,
      });

      const result = await this.execGitSecure(["diff", `${baseBranch}...HEAD`]);
      const diff = result.stdout;

      logger.info("[GIT_SERVICE] Git diff against base completed", {
        baseBranch,
        diffLength: diff.length,
      });

      return {
        success: true,
        diff,
        message: diff
          ? `Retrieved diff against ${baseBranch} successfully`
          : `No differences between ${baseBranch} and current branch`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get git diff against base", {
        baseBranch,
        error: errorMessage,
      });

      return {
        success: false,
        diff: "",
        message: `Failed to get git diff against ${baseBranch}: ${errorMessage}`,
        error: "DIFF_FAILED",
      };
    }
  }

  /**
   * Safely checkout to a specific commit SHA
   */
  async safeCheckoutCommit(commitSha: string): Promise<GitCheckoutResponse> {
    try {
      logger.info("[GIT_SERVICE] Safely checking out commit", {
        commitSha,
      });

      // First verify the commit exists
      try {
        await this.execGitSecure([
          "rev-parse",
          "--verify",
          `${commitSha}^{commit}`,
        ]);
      } catch (_error) {
        return {
          success: false,
          message: `Commit ${commitSha} does not exist`,
          error: "COMMIT_NOT_FOUND",
        };
      }

      // Check if there are uncommitted changes that could be lost
      const statusResult = await this.hasChanges();
      if (statusResult.hasChanges) {
        logger.warn(
          "[GIT_SERVICE] Uncommitted changes detected during checkout",
          {
            commitSha,
          }
        );
        // Git checkout will fail if these changes would be overwritten
      }

      // Perform the checkout
      try {
        await this.execGitSecure(["checkout", commitSha]);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          message: `Failed to checkout ${commitSha}: ${errorMessage}`,
          error: "CHECKOUT_FAILED",
        };
      }

      logger.info("[GIT_SERVICE] Successfully checked out commit", {
        commitSha,
      });

      return {
        success: true,
        message: `Successfully checked out ${commitSha}`,
        commitSha,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to checkout commit", {
        commitSha,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to checkout ${commitSha}: ${errorMessage}`,
        error: "CHECKOUT_FAILED",
      };
    }
  }

  /**
   * Get recent commit messages from current branch compared to base branch
   */
  async getRecentCommitMessages(
    baseBranch: string,
    limit = 5
  ): Promise<GitCommitMessagesResponse> {
    try {
      logger.info("[GIT_SERVICE] Getting recent commit messages", {
        baseBranch,
        limit,
      });

      const result = await this.execGitSecure([
        "log",
        `${baseBranch}..HEAD`,
        "--oneline",
        `-${limit}`,
        "--pretty=format:%s",
      ]);

      const commitMessages = result.stdout.trim().split("\n").filter(Boolean);

      logger.info("[GIT_SERVICE] Recent commit messages retrieved", {
        baseBranch,
        limit,
        messageCount: commitMessages.length,
      });

      return {
        success: true,
        commitMessages,
        message: `Retrieved ${commitMessages.length} recent commit messages`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get recent commit messages", {
        baseBranch,
        limit,
        error: errorMessage,
      });

      return {
        success: false,
        commitMessages: [],
        message: `Failed to get recent commit messages: ${errorMessage}`,
        error: "COMMIT_MESSAGES_FAILED",
      };
    }
  }

  /**
   * Stage all changes and commit with the given options
   * Note: Commit message is required - AI generation should be done on server side
   */
  async commitChanges(options: CommitOptions): Promise<GitCommitResponse> {
    try {
      logger.info("[GIT_SERVICE] Starting commit process", {
        user: options.user,
        hasCoAuthor: !!options.coAuthor,
        hasMessage: !!options.message,
      });

      // Commit message is required - should be generated by server
      if (!options.message) {
        return {
          success: false,
          message: "Commit message is required",
          error: "COMMIT_FAILED",
        };
      }

      const validation = validateGitOperation({
        user: options.user,
        message: options.message,
      });
      if (!validation.isValid) {
        return {
          success: false,
          message: `Invalid input: ${validation.error}`,
          error: "VALIDATION_FAILED",
        };
      }

      // Validate co-author if provided
      if (options.coAuthor) {
        const coAuthorValidation = validateGitUser(options.coAuthor);
        if (!coAuthorValidation.isValid) {
          return {
            success: false,
            message: `Invalid co-author: ${coAuthorValidation.error}`,
            error: "VALIDATION_FAILED",
          };
        }
      }

      // Stage all changes
      await this.execGitSecure(["add", "."]);

      const commitMessage = options.message;

      // Build commit arguments with co-author if provided
      const commitArgs = ["commit", "-m", commitMessage];
      if (options.coAuthor) {
        commitArgs.push("-m", "");
        commitArgs.push(
          "-m",
          `Co-authored-by: ${options.coAuthor.name} <${options.coAuthor.email}>`
        );
      }

      await this.execGitSecure(commitArgs);

      logger.info("[GIT_SERVICE] Commit successful", {
        commitMessage,
        coAuthor: options.coAuthor,
      });

      return {
        success: true,
        message: `Committed changes: "${commitMessage}"`,
        commitMessage,
        commitSha: await this.getCurrentCommitSha(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Commit failed", {
        error: errorMessage,
        options,
      });

      return {
        success: false,
        message: `Failed to commit changes: ${errorMessage}`,
        error: "COMMIT_FAILED",
      };
    }
  }

  /**
   * Push the current branch to remote
   */
  async pushBranch(
    branchName: string,
    setUpstream: boolean = true
  ): Promise<GitPushResponse> {
    try {
      logger.info("[GIT_SERVICE] Pushing branch", {
        branchName,
        setUpstream,
      });

      // Validate branch name
      const validation = validateBranchName(branchName);
      if (!validation.isValid) {
        return {
          success: false,
          message: `Invalid branch name: ${validation.error}`,
          error: "VALIDATION_FAILED",
          branchName,
        };
      }

      const pushArgs = ["push"];
      if (setUpstream) {
        pushArgs.push("--set-upstream", "origin", branchName);
      } else {
        pushArgs.push("origin", branchName);
      }

      await this.execGitSecure(pushArgs);

      logger.info("[GIT_SERVICE] Push successful", { branchName });

      return {
        success: true,
        message: `Successfully pushed branch: ${branchName}`,
        branchName,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Push failed", {
        branchName,
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to push branch: ${errorMessage}`,
        error: "PUSH_FAILED",
        branchName,
      };
    }
  }

  /**
   * Get the current commit SHA
   */
  async getCurrentCommitSha(): Promise<string> {
    try {
      const result = await this.execGitSecure(["rev-parse", "HEAD"]);
      return result.stdout.trim();
    } catch (error) {
      logger.error("[GIT_SERVICE] Failed to get current commit SHA", { error });
      return "unknown";
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<GitBranchInfoResponse> {
    try {
      logger.info("[GIT_SERVICE] Getting current branch");

      const result = await this.execGitSecure(["branch", "--show-current"]);
      const currentBranch = result.stdout.trim();

      logger.info("[GIT_SERVICE] Current branch retrieved", { currentBranch });

      return {
        success: true,
        message: `Current branch: ${currentBranch}`,
        currentBranch,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get current branch", {
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to get current branch: ${errorMessage}`,
        error: "BRANCH_INFO_FAILED",
      };
    }
  }

  /**
   * Get the current commit SHA with API response wrapper
   */
  async getCurrentCommitShaPublic(): Promise<GitCommitInfoResponse> {
    try {
      logger.info("[GIT_SERVICE] Getting current commit SHA");

      const commitSha = await this.getCurrentCommitSha();

      if (commitSha === "unknown") {
        throw new Error("Failed to retrieve commit SHA");
      }

      logger.info("[GIT_SERVICE] Current commit SHA retrieved", { commitSha });

      return {
        success: true,
        message: `Current commit: ${commitSha}`,
        commitSha,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get commit SHA", {
        error: errorMessage,
      });

      return {
        success: false,
        message: `Failed to get commit SHA: ${errorMessage}`,
        error: "COMMIT_INFO_FAILED",
      };
    }
  }

  /**
   * Execute git command securely using argument arrays
   * This prevents command injection by avoiding shell interpretation
   */
  private async execGitSecure(
    gitArgs: string[]
  ): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const workspacePath = this.workspaceService.getWorkspacePath();

      // Validate that all arguments are strings and don't contain dangerous characters
      for (const arg of gitArgs) {
        if (typeof arg !== "string") {
          reject(new Error("Git arguments must be strings"));
          return;
        }
        // Check for null bytes and dangerous characters
        if (
          arg.includes("\0") ||
          arg.includes(";") ||
          arg.includes("|") ||
          arg.includes("&")
        ) {
          logSecurityEvent("Dangerous git argument detected", {
            argument: arg,
            gitArgs,
          });
          reject(new Error("Dangerous characters detected in git arguments"));
          return;
        }
      }

      logger.debug("[GIT_SERVICE] Executing git command", {
        args: gitArgs,
        workspacePath,
      });

      const process = spawn("git", gitArgs, {
        cwd: workspacePath,
        stdio: ["pipe", "pipe", "pipe"],
        // Explicitly disable shell to prevent command injection
        shell: false,
      });

      let stdout = "";
      let stderr = "";

      process.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("close", (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          const error = new Error(
            `Git command failed with exit code ${code}: ${stderr || stdout}`
          );
          logger.error("[GIT_SERVICE] Git command failed", {
            args: gitArgs,
            exitCode: code,
            stdout,
            stderr,
          });
          reject(error);
        }
      });

      process.on("error", (error) => {
        logger.error("[GIT_SERVICE] Git process error", {
          args: gitArgs,
          error: error.message,
        });
        reject(error);
      });
    });
  }

  /**
   * Get file changes since base branch (for file changes API)
   */
  async getFileChanges(baseBranch: string = "main"): Promise<{
    success: boolean;
    fileChanges: Array<{
      filePath: string;
      operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
      additions: number;
      deletions: number;
      createdAt: string;
    }>;
    diffStats: {
      additions: number;
      deletions: number;
      totalFiles: number;
    };
    message?: string;
    error?: string;
  }> {
    try {
      logger.info("[GIT_SERVICE] Getting file changes since base branch", {
        baseBranch,
      });

      const now = new Date().toISOString();

      // Get committed changes using git diff --name-status
      const statusResult = await this.execGitSecure([
        "diff",
        "--name-status",
        `${baseBranch}...HEAD`,
      ]);

      // Get detailed stats using git diff --numstat
      const statsResult = await this.execGitSecure([
        "diff",
        "--numstat",
        `${baseBranch}...HEAD`,
      ]);

      // Get uncommitted changes using git status --porcelain
      const uncommittedResult = await this.execGitSecure([
        "status",
        "--porcelain",
      ]);

      const fileChanges: Array<{
        filePath: string;
        operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
        additions: number;
        deletions: number;
        createdAt: string;
      }> = [];

      // Parse committed changes
      if (statusResult.stdout.trim()) {
        const statusLines = statusResult.stdout.trim().split("\n");
        const statsLines = statsResult.stdout.trim().split("\n");

        // Create stats map
        const statsMap = new Map<
          string,
          { additions: number; deletions: number }
        >();
        for (const line of statsLines) {
          if (!line.trim()) continue;
          const parts = line.split("\t");
          if (parts.length >= 3 && parts[0] && parts[1] && parts[2]) {
            const additions = parseInt(parts[0]) || 0;
            const deletions = parseInt(parts[1]) || 0;
            const filePath = parts[2];
            statsMap.set(filePath, { additions, deletions });
          }
        }

        // Process status lines
        for (const line of statusLines) {
          if (!line.trim()) continue;
          const parts = line.split("\t");
          if (parts.length >= 2 && parts[0] && parts[1]) {
            const status = parts[0];
            const filePath = parts[1];
            const stats = statsMap.get(filePath) || {
              additions: 0,
              deletions: 0,
            };

            let operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
            switch (status.trim()) {
              case "A":
                operation = "CREATE";
                break;
              case "D":
                operation = "DELETE";
                break;
              case "R":
                operation = "RENAME";
                break;
              default:
                operation = "UPDATE";
                break;
            }

            fileChanges.push({
              filePath,
              operation,
              additions: stats.additions,
              deletions: stats.deletions,
              createdAt: now,
            });
          }
        }
      }

      // Parse uncommitted changes
      if (uncommittedResult.stdout.trim()) {
        const uncommittedLines = uncommittedResult.stdout.trim().split("\n");

        for (const line of uncommittedLines) {
          if (!line.trim()) continue;

          const status = line.substring(0, 2);
          const filePath = line.substring(2).replace(/^\s+/, "");

          // Skip if already included from committed changes
          if (fileChanges.some((f) => f.filePath === filePath)) {
            continue;
          }

          let operation: "CREATE" | "UPDATE" | "DELETE" | "RENAME";
          if (status.includes("??")) {
            operation = "CREATE";
          } else if (status.includes("D")) {
            operation = "DELETE";
          } else {
            operation = "UPDATE";
          }

          // For uncommitted files, we'd need additional git diff calls to get exact stats
          // For now, using placeholder values - this can be enhanced if needed
          fileChanges.push({
            filePath,
            operation,
            additions: 0, // Could be enhanced with individual git diff calls
            deletions: 0,
            createdAt: now,
          });
        }
      }

      // Calculate diff stats
      const diffStats = fileChanges.reduce(
        (acc, file) => ({
          additions: acc.additions + file.additions,
          deletions: acc.deletions + file.deletions,
          totalFiles: acc.totalFiles + 1,
        }),
        { additions: 0, deletions: 0, totalFiles: 0 }
      );

      logger.info("[GIT_SERVICE] File changes retrieval completed", {
        baseBranch,
        totalFiles: diffStats.totalFiles,
        additions: diffStats.additions,
        deletions: diffStats.deletions,
      });

      return {
        success: true,
        fileChanges,
        diffStats,
        message: `Found ${diffStats.totalFiles} file changes since ${baseBranch}`,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      logger.error("[GIT_SERVICE] Failed to get file changes", {
        baseBranch,
        error: errorMessage,
      });

      return {
        success: false,
        fileChanges: [],
        diffStats: { additions: 0, deletions: 0, totalFiles: 0 },
        message: `Failed to get file changes since ${baseBranch}: ${errorMessage}`,
        error: "FILE_CHANGES_FAILED",
      };
    }
  }

  /**
   * Sanitize URL for logging (remove tokens)
   */
  private sanitizeUrl(url: string): string {
    return url.replace(/\/\/[^@]+@/, "//***@");
  }
}
