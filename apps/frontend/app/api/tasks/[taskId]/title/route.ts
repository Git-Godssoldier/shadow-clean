import { getTaskTitle } from "@/lib/db-operations/get-task-title";
import { updateTaskTitle } from "@/lib/db-operations/update-task-title";
import { verifyTaskOwnership } from "@/lib/auth/verify-task-ownership";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const { error, user: _user } = await verifyTaskOwnership(taskId);
    if (error) return error;

    const title = await getTaskTitle(taskId);
    return NextResponse.json({ title });
  } catch (error) {
    console.error("Error fetching task title:", error);
    return NextResponse.json(
      { error: "Failed to fetch task title" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    const { taskId } = await params;

    const { error, user: _user } = await verifyTaskOwnership(taskId);
    if (error) return error;

    const { title } = await request.json();

    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Title is required and must be a string" },
        { status: 400 }
      );
    }

    const result = await updateTaskTitle(taskId, title);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update task title" },
        { status: 500 }
      );
    }

    return NextResponse.json({ task: result.task });
  } catch (error) {
    console.error("Error updating task title:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
