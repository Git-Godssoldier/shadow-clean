import * as PrismaPkg from "@prisma/client";

// Support both CJS and ESM shapes of @prisma/client in various runtimes
const PrismaCtor: any = (PrismaPkg as any)?.PrismaClient || (PrismaPkg as any)?.default;
const globalForPrisma = global as unknown as { prisma: InstanceType<typeof PrismaCtor> };

export const prisma = (globalForPrisma as any).prisma || new PrismaCtor();
export const db = prisma; // Export as db for convenience

if (process.env.NODE_ENV !== "production") (globalForPrisma as any).prisma = prisma;

export * from "@prisma/client";
