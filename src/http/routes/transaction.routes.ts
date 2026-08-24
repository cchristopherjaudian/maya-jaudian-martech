import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { TransactionService } from '../../services/transaction.service';
import type { LimitService } from '../../services/limit.service';
import type { UserService } from '../../services/user.service';
import { amountSchema } from '../../domain/schemas';

const CreateTransactionBody = z.object({
  senderId: z.string().uuid().describe('UUID of the sender user'),
  recipientId: z.string().uuid().describe('UUID of the recipient user'),
  amount: amountSchema,
});

const TransactionResponse = z.object({
  id: z.string(),
  senderId: z.string(),
  recipientId: z.string(),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(['COMPLETED', 'FAILED']),
  createdAt: z.string(),
});

const UserParams = z.object({ userId: z.string().uuid() });

const PaginationQuery = z.object({
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().positive().optional(),
});

const PeriodUsageResponse = z.object({
  limit: z.number(),
  spent: z.string(),
  remaining: z.string(),
  resetsAt: z.string(),
});

const LimitUsageResponse = z.object({
  userId: z.string(),
  asOf: z.string(),
  timezone: z.literal('Asia/Manila'),
  daily: PeriodUsageResponse,
  monthly: PeriodUsageResponse,
});

const TransactionHistoryItemResponse = z.object({
  id: z.string(),
  counterpartId: z.string(),
  direction: z.enum(['SENT', 'RECEIVED']),
  amount: z.string(),
  currency: z.string(),
  status: z.enum(['COMPLETED', 'FAILED']),
  createdAt: z.string(),
});

const TransactionHistoryResponse = z.object({
  data: z.array(TransactionHistoryItemResponse),
  pagination: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

export function transactionRoutes(
  transactionService: TransactionService,
  limitService: LimitService,
  userService: UserService,
) {
  return async function (app: FastifyInstance) {
    const typed = app.withTypeProvider<ZodTypeProvider>();

    typed.post(
      '/transactions',
      {
        schema: {
          body: CreateTransactionBody,
          response: { 201: TransactionResponse },
          tags: ['Transactions'],
        },
      },
      async (request, reply) => {
        const tx = await transactionService.sendMoney(request.body, new Date());
        return reply.status(201).send({ ...tx, createdAt: tx.createdAt.toISOString() });
      },
    );

    typed.get(
      '/users/:userId/limits',
      {
        schema: {
          params: UserParams,
          response: { 200: LimitUsageResponse },
          tags: ['Limits'],
        },
      },
      async (request, reply) => {
        await userService.getUserById(request.params.userId);
        const usage = await limitService.getLimitUsage(request.params.userId, new Date());
        return reply.send({
          userId: usage.userId,
          asOf: usage.asOf.toISOString(),
          timezone: usage.timezone,
          daily: {
            limit: usage.daily.limit,
            spent: usage.daily.spent,
            remaining: usage.daily.remaining,
            resetsAt: usage.daily.resetsAt.toISOString(),
          },
          monthly: {
            limit: usage.monthly.limit,
            spent: usage.monthly.spent,
            remaining: usage.monthly.remaining,
            resetsAt: usage.monthly.resetsAt.toISOString(),
          },
        });
      },
    );

    typed.get(
      '/users/:userId/transactions',
      {
        schema: {
          params: UserParams,
          querystring: PaginationQuery,
          response: { 200: TransactionHistoryResponse },
          tags: ['Transactions'],
        },
      },
      async (request, reply) => {
        const { page, pageSize } = request.query;
        const history = await transactionService.getTransactionHistory(request.params.userId, {
          page,
          pageSize,
        });
        return reply.send({
          data: history.data.map((item) => ({
            ...item,
            createdAt: item.createdAt.toISOString(),
          })),
          pagination: history.pagination,
        });
      },
    );
  };
}
