import { NextRequest, NextResponse } from "next/server";
import { getStackedPRInfo } from "@/lib/db-operations/get-stacked-pr-info";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await context.params;

  if (!taskId) {
    return NextResponse.json({ error: "Task ID is required" }, { status: 400 });
  }

  try {
    const stackedPRInfo = await getStackedPRInfo(taskId);

    if (!stackedPRInfo) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(stackedPRInfo);
  } catch (error) {
    console.error("Error fetching stacked PR info:", error);
    return NextResponse.json(
      { error: "Failed to fetch stacked PR info" },
      { status: 500 }
    );
  }
}