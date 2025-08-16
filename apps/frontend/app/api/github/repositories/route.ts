import { getUser } from "@/lib/auth/get-user";
import { getGitHubRepositories } from "@/lib/github/github-api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const groupedRepos = await getGitHubRepositories(user.id);
    return NextResponse.json(groupedRepos);
  } catch (error) {
    console.error("Error fetching repositories:", error);

    if (
      error instanceof Error &&
      (error.message === "GitHub account not connected" ||
        error.message === "GitHub App not installed" ||
        error.message === "Unauthorized")
    ) {
      const statusCode = error.message === "Unauthorized" ? 401 : 400;
      return NextResponse.json(
        { error: error.message },
        { status: statusCode }
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
