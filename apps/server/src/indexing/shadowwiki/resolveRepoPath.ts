import fs from "fs";
import path from "path";
import os from "os";
import { isValidRepo, getOwnerFromRepo } from "../utils/repository";
import logger from "../logger";
import { createWorkspaceManager } from "@/execution";
import type { ToolExecutor } from "@/execution/interfaces/tool-executor";

// Utility function to recursively get all files using ToolExecutor
async function getAllFilesFromExecutor(
  executor: ToolExecutor,
  basePath: string = "."
): Promise<Array<{ path: string; content: string; type: string }>> {
  const files: Array<{ path: string; content: string; type: string }> = [];
  
  async function traverse(currentPath: string) {
    const listing = await executor.listDirectory(currentPath);
    if (!listing.success || !listing.contents) {
      return;
    }
    
    for (const item of listing.contents) {
      const itemPath = currentPath === "." ? item.name : `${currentPath}/${item.name}`;
      
      if (item.isDirectory) {
        // Skip common directories that shouldn't be indexed
        if (item.name.startsWith('.') && item.name !== '.github') {
          continue;
        }
        if (['node_modules', 'dist', 'build', '.next', 'coverage'].includes(item.name)) {
          continue;
        }
        
        // Recursively traverse directory
        await traverse(itemPath);
      } else {
        // Read file content
        const fileResult = await executor.readFile(itemPath);
        if (fileResult.success && fileResult.content) {
          files.push({
            path: itemPath,
            content: fileResult.content,
            type: "file"
          });
        }
      }
    }
  }
  
  await traverse(basePath);
  return files;
}

/**
 * Resolve a repo identifier ("owner/repo" or absolute path) into a local directory path.
 * - If the input already exists on disk, it is returned unchanged.
 * - Otherwise we assume it's a taskId and use the workspace manager to fetch files
 *   into a cache directory under the user's OS temp folder.
 *
 * @param repoOrPath - The repository identifier ("owner/repo") or local path or taskId
 * @param forceRefresh - If true, bypass cache and refetch repository files
 * @returns The absolute checkout/cache path containing the repository files.
 */
export async function resolveRepoPath(
  repoOrPath: string,
  forceRefresh: boolean = false
): Promise<string> {
  // Direct path on disk
  if (fs.existsSync(repoOrPath)) {
    return path.resolve(repoOrPath);
  }

  // Check if it's a valid repo identifier format
  if (!isValidRepo(repoOrPath)) {
    // If not a valid repo format, treat as taskId
    return await resolveFromWorkspace(repoOrPath, forceRefresh);
  }

  const { owner, repo } = getOwnerFromRepo(repoOrPath);
  const cacheDir = path.join(
    os.tmpdir(),
    "shadowwiki-repos",
    `${owner}-${repo}`
  );
  const marker = path.join(cacheDir, ".complete");

  // If we've already cached it, either return immediately or clear the cache
  if (fs.existsSync(marker)) {
    if (!forceRefresh) {
      return cacheDir;
    } else {
      // Force refresh requested - delete the cached repo
      console.log(
        `Force refresh requested for ${owner}/${repo}, clearing cache...`
      );
      try {
        // Recursive deletion of the directory
        fs.rmSync(cacheDir, { recursive: true, force: true });
        // Recreate empty directory
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (error) {
        console.error(`Error clearing cache for ${owner}/${repo}:`, error);
        // Continue with fresh download
      }
    }
  }

  // Ensure directory exists
  fs.mkdirSync(cacheDir, { recursive: true });

  // Use workspace manager to fetch repo files instead of GitHub API
  await fetchRepositoryFilesFromWorkspace(`${owner}/${repo}`, cacheDir);

  // Mark as complete
  fs.writeFileSync(marker, new Date().toISOString());

  return cacheDir;
}

/**
 * Resolve repository files from workspace manager for a taskId.
 */
async function resolveFromWorkspace(
  taskId: string,
  forceRefresh: boolean = false
): Promise<string> {
  const cacheDir = path.join(
    os.tmpdir(),
    "shadowwiki-repos",
    `task-${taskId}`
  );
  const marker = path.join(cacheDir, ".complete");

  // If we've already cached it, either return immediately or clear the cache
  if (fs.existsSync(marker)) {
    if (!forceRefresh) {
      return cacheDir;
    } else {
      // Force refresh requested - delete the cached repo
      console.log(
        `Force refresh requested for task ${taskId}, clearing cache...`
      );
      try {
        // Recursive deletion of the directory
        fs.rmSync(cacheDir, { recursive: true, force: true });
        // Recreate empty directory
        fs.mkdirSync(cacheDir, { recursive: true });
      } catch (error) {
        console.error(`Error clearing cache for task ${taskId}:`, error);
        // Continue with fresh fetch
      }
    }
  }

  // Use workspace manager to fetch files
  fs.mkdirSync(cacheDir, { recursive: true });
  await fetchRepositoryFilesFromWorkspace(taskId, cacheDir);

  // Mark as complete
  fs.writeFileSync(marker, new Date().toISOString());

  return cacheDir;
}

/**
 * Fetch repository files using the workspace manager instead of GitHub API.
 * Uses execution abstraction layer to work in both local and remote modes.
 */
async function fetchRepositoryFilesFromWorkspace(
  taskId: string,
  destDir: string
) {
  const workspaceManager = createWorkspaceManager();
  const executor = await workspaceManager.getExecutor(taskId);

  try {
    const files = await getAllFilesFromExecutor(executor);

    // Skip binary files and very large files
    const skipExtensions = [
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".ico",
      ".svg",
      ".ttf",
      ".woff",
      ".mp3",
      ".mp4",
      ".zip",
      ".gz",
      ".tar",
    ];

    for (const file of files) {
      if (file.type !== "file") continue;

      // Skip binary files
      const ext = path.extname(file.path).toLowerCase();
      if (skipExtensions.includes(ext)) {
        continue;
      }

      // Skip very large files (> 1MB)
      if (file.content.length > 1000000) {
        continue;
      }

      // Skip common directories we don't need to analyze
      const pathParts = file.path.split(path.sep);
      if (
        pathParts.some((part) =>
          ["node_modules", ".git", "dist", "build"].includes(part)
        )
      ) {
        continue;
      }

      // Create parent directories if they don't exist
      const targetPath = path.join(destDir, file.path);
      const targetDir = path.dirname(targetPath);
      fs.mkdirSync(targetDir, { recursive: true });

      // Write file content
      fs.writeFileSync(targetPath, file.content, "utf8");
      console.log(`Fetched from workspace: ${file.path}`);
    }
  } catch (error) {
    logger.error(
      `Failed to fetch files from workspace for ${taskId}: ${error}`
    );
    throw error;
  }
}
