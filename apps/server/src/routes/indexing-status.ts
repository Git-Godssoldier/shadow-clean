import { prisma } from "@repo/db";
import { isCurrentlyIndexing } from "../initialization/background-indexing";

export type IndexingStatusResponse = {
  status: 'not-started' | 'indexing' | 'completed' | 'failed';
  lastIndexedAt?: string | null;
  lastCommitSha?: string | null;
};

/**
 * Get the current indexing status for a repository
 * Combines in-memory activeIndexingJobs with database RepositoryIndex table
 */
export async function getIndexingStatus(repoFullName: string): Promise<IndexingStatusResponse> {
  try {
    // Check if currently indexing in memory
    const isCurrentlyIndexingRepo = isCurrentlyIndexing(repoFullName);
    
    if (isCurrentlyIndexingRepo) {
      return {
        status: 'indexing',
        lastIndexedAt: null,
        lastCommitSha: null
      };
    }

    // Check database for indexing history
    const repositoryIndex = await prisma.repositoryIndex.findUnique({
      where: { repoFullName },
      select: {
        lastIndexedAt: true,
        lastCommitSha: true
      }
    });

    if (!repositoryIndex) {
      return {
        status: 'not-started',
        lastIndexedAt: null,
        lastCommitSha: null
      };
    }

    if (repositoryIndex.lastIndexedAt) {
      return {
        status: 'completed',
        lastIndexedAt: repositoryIndex.lastIndexedAt.toISOString(),
        lastCommitSha: repositoryIndex.lastCommitSha
      };
    }

    // Repository exists in database but no successful indexing
    return {
      status: 'failed',
      lastIndexedAt: null,
      lastCommitSha: repositoryIndex.lastCommitSha
    };

  } catch (error) {
    console.error(`[INDEXING_STATUS] Error fetching status for ${repoFullName}:`, error);
    return {
      status: 'failed',
      lastIndexedAt: null,
      lastCommitSha: null
    };
  }
}