import { getTaskStatus } from "@/lib/db-operations/get-task-status";
import { verifyTaskOwnership } from "@/lib/auth/verify-task-ownership";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  try {
    const { error, user: _user } = await verifyTaskOwnership(taskId);
    if (error) return error;

    const status = await getTaskStatus(taskId);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Error fetching task status:", error);
    return NextResponse.json(
      { error: "Failed to fetch task status" },
      { status: 500 }
    );
  }
}
