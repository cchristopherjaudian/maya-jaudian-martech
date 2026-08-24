import { beforeEach, afterAll } from 'vitest';
import { testPrisma, resetDatabase } from './helpers/db';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await testPrisma.$disconnect();
});
