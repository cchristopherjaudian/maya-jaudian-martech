import { PrismaClient } from '@prisma/client';
import type { PrismaTransactionClient } from '../infrastructure/database';
import type {
  CreateTransactionData,
  Transaction,
  PeriodBoundary,
  PaginationOptions,
  PaginatedResult,
} from '../domain';

export class TransactionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateTransactionData, tx?: PrismaTransactionClient): Promise<Transaction> {
    const client = tx ?? this.prisma;
    const row = await client.transaction.create({ data });
    return this.toTransaction(row);
  }

  async sumByPeriod(
    senderId: string,
    period: PeriodBoundary,
    tx?: PrismaTransactionClient,
  ): Promise<string> {
    const client = tx ?? this.prisma;
    const result = await client.transaction.aggregate({
      _sum: { amount: true },
      where: {
        senderId,
        status: 'COMPLETED',
        createdAt: { gte: period.start, lt: period.end },
      },
    });
    const sum = result._sum.amount;
    return sum !== null ? sum.toFixed(2) : '0.00';
  }

  async findByUserId(
    userId: string,
    options: PaginationOptions,
  ): Promise<PaginatedResult<Transaction>> {
    const { page, pageSize } = options;
    const skip = (page - 1) * pageSize;
    const where = { OR: [{ senderId: userId }, { recipientId: userId }] };

    const [rows, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toTransaction(row)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  private toTransaction(row: {
    id: string;
    senderId: string;
    recipientId: string;
    amount: { toFixed: (dp: number) => string };
    currency: string;
    status: string;
    createdAt: Date;
  }): Transaction {
    return {
      id: row.id,
      senderId: row.senderId,
      recipientId: row.recipientId,
      amount: row.amount.toFixed(2),
      currency: row.currency,
      status: row.status as Transaction['status'],
      createdAt: row.createdAt,
    };
  }
}
