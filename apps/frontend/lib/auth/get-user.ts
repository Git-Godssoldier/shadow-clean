import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";

export type AuthUser = Awaited<ReturnType<typeof getUser>>;

export async function getUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return null;
  }

  return session.user;
}
