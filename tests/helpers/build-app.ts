import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/http/app';
import { UserRepository } from '../../src/repositories/user.repository';
import { TransactionRepository } from '../../src/repositories/transaction.repository';
import { UserService } from '../../src/services/user.service';
import { LimitService } from '../../src/services/limit.service';
import { TransactionService } from '../../src/services/transaction.service';
import { testPrisma } from './db';

export async function buildTestApp(): Promise<FastifyInstance> {
  const userRepository = new UserRepository(testPrisma);
  const transactionRepository = new TransactionRepository(testPrisma);
  const userService = new UserService(userRepository);
  const limitService = new LimitService(transactionRepository);
  const transactionService = new TransactionService(
    testPrisma,
    userRepository,
    limitService,
    transactionRepository,
  );

  return buildApp({ userService, transactionService, limitService });
}
