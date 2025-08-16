import { createAuthClient } from "better-auth/react";

const baseURL = process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const authClient: ReturnType<typeof createAuthClient> = createAuthClient(
  {
    baseURL,
    basePath: "/api/auth",
  }
);

// This destructuring is necessary to avoid weird better-auth type errors
export const signIn: typeof authClient.signIn = authClient.signIn;
export const signOut: typeof authClient.signOut = authClient.signOut;
export const signUp: typeof authClient.signUp = authClient.signUp;
export const useSession: typeof authClient.useSession = authClient.useSession;
