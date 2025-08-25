import { db } from "@repo/db";

export type StackedPRInfo = {
  id: string;
  title: string;
  status: string;
  shadowBranch: string | null;
} | null;

export async function getStackedPRInfo(taskId: string): Promise<StackedPRInfo> {
  try {
    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        status: true,
        shadowBranch: true,
      },
    });

    return task || null;
  } catch (err) {
    console.error("Failed to fetch stacked PR info", err);
    return null;
  }
}