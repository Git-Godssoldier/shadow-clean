import { getTaskMessages } from "@/lib/db-operations/get-task-messages";
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

    const messages = await getTaskMessages(taskId);

    return NextResponse.json(messages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
