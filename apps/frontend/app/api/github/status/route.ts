import { getUser } from "@/lib/auth/get-user";
import { getGitHubStatus } from "@/lib/github/github-api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const status = await getGitHubStatus(user.id);
    return NextResponse.json(status);
  } catch (error) {
    console.error("Error checking GitHub status:", error);

    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
