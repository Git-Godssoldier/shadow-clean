import { getUser } from "@/lib/auth/get-user";
import { getTasks } from "@/lib/db-operations/get-tasks";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      // In local dev, return empty list instead of 401 to avoid breaking UI
      const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
      if (!isProd) {
        return NextResponse.json({ tasks: [] });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await getTasks(user.id);
    return NextResponse.json({ tasks });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
