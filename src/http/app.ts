import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerErrorHandler } from './plugins/error-handler';
import type { UserService } from '../services/user.service';
import type { TransactionService } from '../services/transaction.service';
import type { LimitService } from '../services/limit.service';
import { userRoutes } from './routes/user.routes';
import { transactionRoutes } from './routes/transaction.routes';

export interface AppDependencies {
  userService: UserService;
  transactionService: TransactionService;
  limitService: LimitService;
}

export async function buildApp(deps: AppDependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: process.env['LOG_LEVEL'] ?? 'info' } });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Send Money Limits API',
        version: '1.0.0',
        description: 'PHP send-money service with daily and monthly spending limits (Asia/Manila timezone)',
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, { routePrefix: '/docs' });

  registerErrorHandler(app);

  app.get('/health', { schema: { hide: true } }, async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));

  await app.register(userRoutes(deps.userService), { prefix: '/api' });
  await app.register(transactionRoutes(deps.transactionService, deps.limitService), { prefix: '/api' });

  return app;
}
