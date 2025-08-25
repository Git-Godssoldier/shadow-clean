import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config";
import { logger } from "../utils/logger";
import { WorkspaceStatusResponse } from "@repo/types";

const execAsync = promisify(exec);

export class WorkspaceService {
  private workspaceDir: string;

  constructor() {
    this.workspaceDir = config.workspaceDir;
  }

  /**
   * Get the workspace directory path
   */
  getWorkspacePath(): string {
    return this.workspaceDir;
  }

  /**
   * Ensure the workspace directory exists and configure Git safe directory
   */
  async ensureWorkspace(): Promise<void> {
    try {
      await fs.access(this.workspaceDir);
    } catch {
      logger.info(`Creating workspace directory: ${this.workspaceDir}`);
      await fs.mkdir(this.workspaceDir, { recursive: true });
    }

    // Configure Git to trust the workspace directory
    // This fixes "dubious ownership" errors when Git operations run as different user
    try {
      await execAsync(
        `git config --global --add safe.directory ${this.workspaceDir}`
      );
      logger.info(`Configured Git safe directory: ${this.workspaceDir}`);
    } catch (error) {
      // Log warning but don't fail startup - Git operations may still work
      logger.warn("Failed to configure Git safe directory", {
        error: error instanceof Error ? error.message : String(error),
        workspaceDir: this.workspaceDir,
      });
    }

    // Configure Git user as Shadow (Shadow will be the author, user will be co-author)
    try {
      await execAsync('git config --global user.name "Shadow"');
      await execAsync(
        'git config --global user.email "noreply@shadowrealm.ai"'
      );
      logger.info("Configured Git user as Shadow");
    } catch (error) {
      // Log warning but don't fail startup - Git operations may still work
      logger.warn("Failed to configure Git user", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get workspace status
   */
  async getStatus(): Promise<WorkspaceStatusResponse> {
    try {
      const stats = await fs.stat(this.workspaceDir);

      // Get workspace size using du command
      let sizeBytes = 0;
      try {
        const { stdout } = await execAsync("du -sb .", {
          cwd: this.workspaceDir,
        });
        const match = stdout.match(/^(\d+)/);
        sizeBytes = match?.[1] ? parseInt(match[1], 10) : 0;
      } catch (error) {
        logger.warn("Failed to get workspace size", { error });
      }

      return {
        success: true,
        exists: true,
        path: this.workspaceDir,
        isReady: stats.isDirectory(),
        sizeBytes,
      };
    } catch (error) {
      return {
        success: false,
        exists: false,
        path: this.workspaceDir,
        isReady: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Resolve a relative path to an absolute workspace path
   */
  resolvePath(relativePath: string): string {
    // Remove leading slash if present
    const cleanPath = relativePath.startsWith("/")
      ? relativePath.slice(1)
      : relativePath;

    // Resolve and normalize the path
    const resolvedPath = path.resolve(this.workspaceDir, cleanPath);

    // Security check: ensure path is within workspace directory
    // Use path.relative() to detect traversal attempts, including via symlinks
    const relativeToWorkspace = path.relative(this.workspaceDir, resolvedPath);
    if (
      relativeToWorkspace.startsWith("..") ||
      path.isAbsolute(relativeToWorkspace)
    ) {
      throw new Error("Path traversal detected");
    }

    return resolvedPath;
  }

  /**
   * Check if a path exists within the workspace
   */
  async pathExists(relativePath: string): Promise<boolean> {
    try {
      const fullPath = this.resolvePath(relativePath);
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the workspace root directory
   */
  getWorkspaceDir(): string {
    return this.workspaceDir;
  }
}

export default WorkspaceService;
