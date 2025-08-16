import { db, Task } from "@repo/db";

export async function getTasks(userId: string): Promise<Task[]> {
  let initialTasks: Task[] = [];
  try {
    initialTasks = await db.task.findMany({
      where: {
        userId,
      },
      orderBy: [{ repoUrl: "asc" }, { status: "asc" }, { updatedAt: "desc" }],
    });
  } catch (err) {
    console.error("Failed to fetch initial tasks", err);
  }

  return initialTasks;
}
