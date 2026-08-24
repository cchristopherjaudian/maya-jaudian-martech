import { loadConfig } from './config';
import { createPrismaClient } from './infrastructure/database';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { UserService } from './services/user.service';
import { LimitService } from './services/limit.service';
import { TransactionService } from './services/transaction.service';
import { buildApp } from './http/app';

async function main() {
  const config = loadConfig();
  const prisma = createPrismaClient(config.databaseUrl);

  const userRepository = new UserRepository(prisma);
  const transactionRepository = new TransactionRepository(prisma);
  const userService = new UserService(userRepository);
  const limitService = new LimitService(transactionRepository);
  const transactionService = new TransactionService(prisma, userRepository, limitService, transactionRepository);

  const app = await buildApp({ userService, transactionService, limitService });

  const shutdown = async () => {
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await app.listen({ port: config.port, host: '0.0.0.0' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
