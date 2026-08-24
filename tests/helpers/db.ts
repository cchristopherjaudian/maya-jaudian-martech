import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

const adapter = new PrismaPg(process.env.DATABASE_URL as string);

export const testPrisma = new PrismaClient({ adapter });

export async function resetDatabase(): Promise<void> {
  await testPrisma.$executeRawUnsafe('TRUNCATE TABLE transactions, users RESTART IDENTITY CASCADE');
}
