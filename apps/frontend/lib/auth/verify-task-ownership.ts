import { getUser } from "@/lib/auth/get-user";
import { db } from "@repo/db";
import { NextResponse } from "next/server";

export async function verifyTaskOwnership(taskId: string) {
  // Check authentication
  const user = await getUser();
  if (!user) {
    return {
      error: NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      ),
      user: null,
    };
  }

  // Get task and verify ownership
  const task = await db.task.findUnique({
    where: { id: taskId },
    select: { userId: true },
  });

  if (!task) {
    return {
      error: NextResponse.json(
        { success: false, error: "Task not found" },
        { status: 404 }
      ),
      user: null,
    };
  }

  // Verify task ownership
  if (task.userId !== user.id) {
    return {
      error: NextResponse.json(
        { success: false, error: "Forbidden" },
        { status: 403 }
      ),
      user: null,
    };
  }

  return { error: null, user };
}