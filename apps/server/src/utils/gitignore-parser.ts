import ignore from "ignore";
import fs from "fs";
import path from "path";

export class GitignoreChecker {
  private ignoreFilter: ReturnType<typeof ignore>;
  private workspacePath: string;

  // Default patterns that are always ignored (from existing hardcoded patterns)
  private static readonly DEFAULT_PATTERNS = [
    ".git/",
    "node_modules/",
    ".vscode/",
    ".cursor/",
    ".DS_Store",
    "*.tmp",
    "*.log",
    "*~",
    ".nyc_output/",
    "coverage/",
    "dist/",
    "build/",
    "tmp/",
    "*.swp",
    "*.swo",
  ];

  constructor(workspacePath: string, gitignoreContent?: string) {
    this.workspacePath = workspacePath;
    this.ignoreFilter = ignore().add(GitignoreChecker.DEFAULT_PATTERNS);
    
    if (gitignoreContent !== undefined) {
      // Use provided gitignore content (remote mode)
      this.ignoreFilter.add(gitignoreContent);
    } else {
      // Read .gitignore file from filesystem (local mode)
      this.loadGitignoreFile();
    }
  }

  private loadGitignoreFile(): void {
    try {
      const gitignorePath = path.join(this.workspacePath, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf8");
        this.ignoreFilter.add(gitignoreContent);
      }
    } catch (error) {
      // Silently fail if gitignore cannot be read - we'll use default patterns
      console.warn(`Warning: Could not load .gitignore file: ${error}`);
    }
  }

  /**
   * Check if a file path should be ignored based on .gitignore rules and default patterns
   * @param filePath - Absolute or relative path to check
   * @returns true if the file should be ignored
   */
  public shouldIgnoreFile(filePath: string): boolean {
    try {
      // Convert absolute path to relative path from workspace root
      const relativePath = path.isAbsolute(filePath)
        ? path.relative(this.workspacePath, filePath)
        : filePath;

      // Normalize path separators for cross-platform compatibility
      const normalizedPath = relativePath.replace(/\\/g, "/");

      // Skip if path goes outside workspace (e.g., ../file)
      if (normalizedPath.startsWith("../")) {
        return true;
      }

      return this.ignoreFilter.ignores(normalizedPath);
    } catch (error) {
      // If there's any error processing the path, default to not ignoring
      console.warn(
        `Warning: Error checking ignore status for ${filePath}: ${error}`
      );
      return false;
    }
  }

  /**
   * Reload .gitignore file (useful if gitignore changes during runtime)
   */
  public reload(): void {
    this.ignoreFilter = ignore().add(GitignoreChecker.DEFAULT_PATTERNS);
    this.loadGitignoreFile();
  }
}

/**
 * Factory function to create a gitignore checker for a workspace
 */
export function createGitignoreChecker(
  workspacePath: string
): GitignoreChecker {
  return new GitignoreChecker(workspacePath);
}

/**
 * Create GitignoreChecker using ToolExecutor (works in both local and remote modes)
 */
export async function createGitignoreCheckerWithExecutor(
  workspacePath: string,
  executor: { readFile(path: string): Promise<{ success: boolean; content?: string }> }
): Promise<GitignoreChecker> {
  try {
    const gitignoreResult = await executor.readFile(".gitignore");
    const gitignoreContent = gitignoreResult.success && gitignoreResult.content ? gitignoreResult.content : "";
    return new GitignoreChecker(workspacePath, gitignoreContent);
  } catch (error) {
    console.warn(`Warning: Could not read .gitignore via executor: ${error}`);
    return new GitignoreChecker(workspacePath, "");
  }
}