import { getUser } from "@/lib/auth/get-user";
import { getGitHubStatus } from "@/lib/github/github-api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_request: NextRequest) {
  try {
    // Allow unauthenticated access in local/dev to enable quick start with PAT
    const isProd = process.env.NEXT_PUBLIC_VERCEL_ENV === "production";
    const forceApp = process.env.NEXT_PUBLIC_FORCE_GITHUB_APP === "true";
    const hasPersonalToken =
      !!process.env.GITHUB_PERSONAL_ACCESS_TOKEN || !!process.env.GITHUB_TOKEN;

    const user = await getUser();

    if (!user) {
      if (!isProd && !forceApp && hasPersonalToken) {
        // Mirror the local dev behavior: treat GitHub as connected
        return NextResponse.json({
          isConnected: true,
          isAppInstalled: true,
          installationUrl: undefined,
          message: "Local mode: GitHub treated as connected",
        });
      }
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
