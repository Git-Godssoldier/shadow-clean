import { prisma } from "@repo/db";

export async function clearGitHubInstallation(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
  });

  if (!account) {
    return null;
  }

  return await prisma.account.update({
    where: {
      id: account.id,
    },
    data: {
      githubInstallationId: null,
      githubAppConnected: false,
    },
  });
}
