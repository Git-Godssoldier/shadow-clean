import { prisma } from "@repo/db";
import { MAX_TASKS_PER_USER_PRODUCTION } from "@repo/types";
import config from "../config";

/**
 * Check if user has reached the maximum number of active tasks
 * Only applies in production environment
 */
export async function hasReachedTaskLimit(userId: string): Promise<boolean> {
  if (config.nodeEnv !== "production") {
    return false;
  }

  const activeTaskCount = await prisma.task.count({
    where: {
      userId,
      status: {
        notIn: ["COMPLETED", "FAILED", "ARCHIVED"],
      },
    },
  });
  return activeTaskCount >= MAX_TASKS_PER_USER_PRODUCTION;
}
