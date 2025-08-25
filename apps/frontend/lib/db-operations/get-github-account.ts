import { prisma } from "@repo/db";

export async function getGitHubAccount(userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      providerId: "github",
    },
  });

  return account;
}
