import { prisma } from "@repo/db";
import indexRepo from "../indexing/indexer";
import { IndexRepoOptions } from "@repo/types";

// Global tracking of active indexing operations
const activeIndexingJobs = new Map<string, Promise<void>>();

/**
 * Start background indexing for a repository with duplicate detection
 * Uses RepositoryIndex table to track indexing state per repository
 */
export async function startBackgroundIndexing(
  repoFullName: string,
  taskId: string,
  options: IndexRepoOptions = {
    clearNamespace: true,
    force: false
  }
): Promise<void> {
  // Check if already indexing this repo (unless forced)
  if (!options.force && activeIndexingJobs.has(repoFullName)) {
    console.log(`[BACKGROUND_INDEXING] Already indexing ${repoFullName}, skipping duplicate`);
    return;
  }

  // Get current task's commit SHA for smart duplicate detection
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { baseCommitSha: true }
  });

  if (!task) {
    console.error(`[BACKGROUND_INDEXING] Task ${taskId} not found, proceeding with indexing anyway`);
  }

  // Check if we've already indexed this exact commit (unless forced)
  if (!options.force && task?.baseCommitSha) {
    const repositoryIndex = await prisma.repositoryIndex.findUnique({
      where: { repoFullName }
    });

    if (repositoryIndex?.lastCommitSha === task.baseCommitSha) {
      console.log(`[BACKGROUND_INDEXING] Repository ${repoFullName} already indexed for commit ${task.baseCommitSha}, skipping`);
      return;
    }
  }

  if (task?.baseCommitSha) {
    console.log(`[BACKGROUND_INDEXING] Starting background indexing for ${repoFullName} at commit ${task.baseCommitSha} (task: ${taskId})`);
  } else {
    console.log(`[BACKGROUND_INDEXING] Starting background indexing for ${repoFullName} (task: ${taskId}, no commit tracking)`);
  }

  // Start indexing promise
  const indexingPromise = indexRepo(repoFullName, taskId, {
    clearNamespace: options.clearNamespace ?? true,
    // Note: force is not passed to indexRepo as it's only used for background indexing logic
  })
    .then(() => {
      console.log(`[BACKGROUND_INDEXING] Background indexing completed successfully for ${repoFullName}`);
    })
    .catch((error) => {
      console.error(`[BACKGROUND_INDEXING] Background indexing failed for ${repoFullName}:`, error);
      // Don't throw - we don't want to crash the task
    })
    .finally(async () => {
      // Clean up tracking and update repository index
      activeIndexingJobs.delete(repoFullName);
      
      try {
        // Update or create repository index record with commit SHA
        await prisma.repositoryIndex.upsert({
          where: { repoFullName },
          update: { 
            lastIndexedAt: new Date(),
            lastCommitSha: task?.baseCommitSha || null,
          },
          create: {
            repoFullName,
            lastIndexedAt: new Date(),
            lastCommitSha: task?.baseCommitSha || null,
          }
        });
        if (task?.baseCommitSha) {
          console.log(`[BACKGROUND_INDEXING] Updated repository index for ${repoFullName} with commit ${task.baseCommitSha}`);
        } else {
          console.log(`[BACKGROUND_INDEXING] Updated repository index for ${repoFullName} (no commit tracking)`);
        }
      } catch (error) {
        console.error(`[BACKGROUND_INDEXING] Failed to update repository index for ${repoFullName}:`, error);
      }
    });

  // Track the promise
  activeIndexingJobs.set(repoFullName, indexingPromise);
  
  // Don't await - let it run in background
}

// Check if a repository is currently being indexed
export function isCurrentlyIndexing(repoFullName: string): boolean {
  return activeIndexingJobs.has(repoFullName);
}

// Check if indexing is complete for a repository
export async function isIndexingComplete(repoFullName: string): Promise<boolean> {
  // If currently indexing, return false
  if (isCurrentlyIndexing(repoFullName)) {
    return false;
  }
  
  // Check if we have a completed index in database
  const repositoryIndex = await prisma.repositoryIndex.findUnique({
    where: { repoFullName }
  });
  
  return !!repositoryIndex?.lastIndexedAt;
}

// Get the current indexing promise for a repository (if any)
export function getIndexingPromise(repoFullName: string): Promise<void> | undefined {
  return activeIndexingJobs.get(repoFullName);
}

// Get list of all repositories currently being indexed 
export function getCurrentlyIndexingRepos(): string[] {
  return Array.from(activeIndexingJobs.keys());
}