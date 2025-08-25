import { generateText } from "ai";
import { exec } from "child_process";
import { promisify } from "util";
import { ModelProvider } from "@/agent/llm/models/model-provider";
import { TaskModelContext } from "./task-model-context";
import { braintrustService } from "../agent/llm/observability/braintrust-service";
import { AvailableModels } from "@repo/types";

const execAsync = promisify(exec);

export interface GitUser {
  name: string;
  email: string;
}

export interface CommitOptions {
  user: GitUser;
  coAuthor: GitUser;
  context: TaskModelContext;
  message?: string;
}

export class GitManager {
  private workspacePath: string;

  constructor(workspacePath: string) {
    this.workspacePath = workspacePath;
  }

  /**
   * Configure git user for commits in the workspace
   */
  async configureGitUser(user: GitUser): Promise<void> {
    try {
      await this.execGit(`config user.name "${user.name}"`);
      await this.execGit(`config user.email "${user.email}"`);
      console.log(
        `[GIT_MANAGER] Configured git user: ${user.name} <${user.email}>`
      );
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to configure git user:`, error);
      throw error;
    }
  }

  /**
   * Create and checkout a shadow branch for the task, and publish it to remote
   */
  async createShadowBranch(
    baseBranch: string,
    shadowBranch: string
  ): Promise<string> {
    try {
      // Ensure we're on the base branch first
      await this.execGit(`checkout ${baseBranch}`);

      // Get the base commit SHA before creating the branch
      const baseCommitSha = await this.getCurrentCommitSha();

      // Create and checkout the shadow branch
      await this.execGit(`checkout -b ${shadowBranch}`);

      // Immediately publish the branch to remote so it's available for collaboration
      try {
        await this.pushBranch(shadowBranch, true);
        console.log(
          `[GIT_MANAGER] Published shadow branch to remote: ${shadowBranch}`
        );
      } catch (pushError) {
        console.warn(
          `[GIT_MANAGER] Failed to publish shadow branch (continuing locally):`,
          pushError
        );
        // Don't fail the entire operation if push fails - branch still works locally
      }

      console.log(
        `[GIT_MANAGER] Created shadow branch: ${shadowBranch} from ${baseBranch} (${baseCommitSha})`
      );
      return baseCommitSha;
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to create shadow branch:`, error);
      throw error;
    }
  }

  /**
   * Check if there are any uncommitted changes
   */
  async hasChanges(): Promise<boolean> {
    try {
      const { stdout } = await this.execGit("status --porcelain");

      console.log(`[GIT_MANAGER] hasChanges:`, {
        statusOutput: stdout.trim(),
      });

      // Git status --porcelain returns one line per changed file
      // Format: "XY filename" where X=index status, Y=working tree status
      // Examples: "?? newfile.md", "M  modified.js", "A  added.txt"
      return stdout.trim().length > 0;
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to check for changes:`, error);
      return false;
    }
  }

  /**
   * Get git diff of current changes
   */
  async getDiff(): Promise<string> {
    try {
      // Get both staged and unstaged changes
      const { stdout: unstagedDiff } = await this.execGit("diff");
      const { stdout: stagedDiff } = await this.execGit("diff --cached");

      return [unstagedDiff, stagedDiff]
        .filter((diff) => diff.trim())
        .join("\n\n");
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to get diff:`, error);
      return "";
    }
  }

  /**
   * Get git diff against a base branch (for PR generation)
   */
  async getDiffAgainstBase(baseBranch: string = "main"): Promise<string> {
    try {
      const { stdout: diff } = await this.execGit(`diff ${baseBranch}...HEAD`);
      return diff;
    } catch (error) {
      console.error(
        `[GIT_MANAGER] Failed to get diff against ${baseBranch}:`,
        error
      );
      return "";
    }
  }

  /**
   * Generate a commit message using AI based on the git diff
   */
  async generateCommitMessage(
    diff: string,
    context: TaskModelContext
  ): Promise<string> {
    try {
      // Use mini model for commit message generation (cost optimization)
      const model = context.getModelForOperation("commit-msg");
      const apiKey = context.getApiKeyForOperation("commit-msg");

      if (!apiKey) {
        console.warn(
          "[GIT_MANAGER] No API key available for commit message generation"
        );
        return "Update code via Shadow agent";
      }

      const modelProvider = new ModelProvider();
      const modelInstance = modelProvider.getModel(model, context.getApiKeys());

      const isGPT5Family =
        model === AvailableModels.GPT_5 || model === AvailableModels.GPT_5_MINI;

      const { text } = await generateText({
        model: modelInstance,
        temperature: isGPT5Family ? 1 : 0.3,
        ...(isGPT5Family ? { maxCompletionTokens: 100 } : { maxTokens: 100 }),
        prompt: `Generate a concise git commit message for these changes. Focus on what was changed, not how. Use imperative mood (e.g., "Add", "Fix", "Update"). Keep it under 50 characters.

Git diff:
${diff}

Commit message:`,
        experimental_telemetry: braintrustService.getOperationTelemetry(
          "commit-message-generation",
          {
            model,
            diffLength: diff.length,
            ...(model === AvailableModels.GPT_5
              ? { maxCompletionTokens: 100 }
              : { maxTokens: 100 }),
            temperature: isGPT5Family ? 1 : 0.3,
            workspacePath: this.workspacePath,
          }
        ),
      });

      const commitMessage = text.trim().replace(/^["']|["']$/g, ""); // Remove quotes if present
      console.log(`[GIT_MANAGER] Generated commit message: "${commitMessage}"`);
      return commitMessage;
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to generate commit message:`, error);
      // Fallback to simple message
      return "Update code via Shadow agent";
    }
  }

  /**
   * Stage all changes and commit with the given options
   */
  async commitChanges(options: CommitOptions): Promise<string> {
    try {
      // Stage all changes
      await this.execGit("add .");

      // Get diff for commit message generation if not provided
      let commitMessage = options.message;
      if (!commitMessage) {
        const diff = await this.getDiff();
        if (diff) {
          commitMessage = await this.generateCommitMessage(
            diff,
            options.context
          );
        } else {
          commitMessage = "Update code via Shadow agent";
        }
      }

      // Build commit command with explicit author and co-author if provided
      let commitCmd = `commit --author="${options.user.name} <${options.user.email}>" -m "${commitMessage}"`;
      if (options.coAuthor) {
        commitCmd += ` -m "" -m "Co-authored-by: ${options.coAuthor.name} <${options.coAuthor.email}>"`;
      }

      const { stdout } = await this.execGit(commitCmd);

      console.log(`[GIT_MANAGER] Committed changes: "${commitMessage}"`);
      return stdout;
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to commit changes:`, error);
      throw error;
    }
  }

  /**
   * Push the current branch to remote
   */
  async pushBranch(
    branchName: string,
    setUpstream: boolean = true
  ): Promise<void> {
    try {
      let pushCmd = `push`;
      if (setUpstream) {
        pushCmd += ` --set-upstream origin ${branchName}`;
      } else {
        pushCmd += ` origin ${branchName}`;
      }

      await this.execGit(pushCmd);
      console.log(`[GIT_MANAGER] Pushed branch: ${branchName}`);
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to push branch:`, error);
      throw error;
    }
  }

  /**
   * Get the current commit SHA
   */
  async getCurrentCommitSha(): Promise<string> {
    try {
      const { stdout } = await this.execGit("rev-parse HEAD");
      return stdout.trim();
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to get current commit SHA:`, error);
      throw error;
    }
  }

  /**
   * Get the current branch name
   */
  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await this.execGit("rev-parse --abbrev-ref HEAD");
      return stdout.trim();
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to get current branch:`, error);
      throw error;
    }
  }

  /**
   * Execute a git command in the workspace directory
   */
  public async execGit(
    gitArgs: string
  ): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${gitArgs}`;
    const options = {
      cwd: this.workspacePath,
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer for large diffs
    };

    try {
      const result = await execAsync(command, options);
      return result;
    } catch (error: unknown) {
      // Log the command and error for debugging
      const errorObj = error as {
        code?: string;
        stdout?: string;
        stderr?: string;
      };
      console.error(`[GIT_MANAGER] Command failed: ${command}`, {
        code: errorObj.code,
        stdout: errorObj.stdout,
        stderr: errorObj.stderr,
      });
      throw error;
    }
  }

  /**
   * Initialize a git repository if it doesn't exist
   */
  async initializeGitRepo(): Promise<void> {
    try {
      // Check if .git directory exists
      const { stdout } = await this.execGit("rev-parse --is-inside-work-tree");
      if (stdout.trim() === "true") {
        console.log(`[GIT_MANAGER] Git repository already exists`);
        return;
      }
    } catch {
      // Not a git repo, initialize it
      try {
        await this.execGit("init");
        console.log(`[GIT_MANAGER] Initialized git repository`);
      } catch (error) {
        console.error(
          `[GIT_MANAGER] Failed to initialize git repository:`,
          error
        );
        throw error;
      }
    }
  }

  /**
   * Safely checkout to specific commit with error handling
   */
  async safeCheckoutCommit(commitSha: string): Promise<boolean> {
    try {
      await this.execGit(`checkout ${commitSha}`);
      console.log(
        `[GIT_MANAGER] Successfully checked out to commit ${commitSha}`
      );
      return true;
    } catch (error) {
      console.warn(`[GIT_MANAGER] Cannot checkout to ${commitSha}:`, error);
      return false;
    }
  }

  /**
   * Commit changes after an LLM response if there are any
   */
  async commitChangesIfAny(
    user: GitUser,
    coAuthor: GitUser,
    context: TaskModelContext
  ): Promise<boolean> {
    try {
      const hasChanges = await this.hasChanges();
      if (!hasChanges) {
        console.log(`[GIT_MANAGER] No changes to commit`);
        return false;
      }

      await this.commitChanges({
        user,
        coAuthor,
        context,
      });

      // Try to push the changes
      try {
        const currentBranch = await this.getCurrentBranch();
        await this.pushBranch(currentBranch);
      } catch (pushError) {
        console.warn(
          `[GIT_MANAGER] Failed to push changes (continuing anyway):`,
          pushError
        );
        // Don't throw here - commit succeeded even if push failed
      }

      return true;
    } catch (error) {
      console.error(`[GIT_MANAGER] Failed to commit changes:`, error);
      throw error;
    }
  }

  /**
   * Get the workspace path
   */
  public getWorkspacePath(): string {
    return this.workspacePath;
  }

}

export default GitManager;
