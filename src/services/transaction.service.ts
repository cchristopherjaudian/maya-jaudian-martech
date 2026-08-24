import { Prisma, PrismaClient } from '@prisma/client';
import { LimitExceededError, SelfTransferError, UserNotFoundError } from '../domain';
import type {
  CreateTransactionDto,
  PaginatedResult,
  PaginationOptions,
  Transaction,
  TransactionHistoryItem,
} from '../domain';
import type { PrismaTransactionClient } from '../infrastructure/database';
import type { UserRepository } from '../repositories/user.repository';
import type { TransactionRepository } from '../repositories/transaction.repository';
import type { LimitService } from './limit.service';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export class TransactionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly userRepository: UserRepository,
    private readonly limitService: LimitService,
    private readonly transactionRepository: TransactionRepository,
  ) {}

  async sendMoney(dto: CreateTransactionDto, now: Date): Promise<Transaction> {
    const { senderId, recipientId, amount } = dto;

    if (senderId === recipientId) throw new SelfTransferError();

    let limitError: LimitExceededError | null = null;
    let result: Transaction | null = null;

    await this.prisma.$transaction(async (tx: PrismaTransactionClient) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${senderId}::uuid FOR UPDATE`);

      const sender = await this.userRepository.findById(senderId);
      if (!sender) throw new UserNotFoundError(senderId);

      const recipient = await this.userRepository.findById(recipientId);
      if (!recipient) throw new UserNotFoundError(recipientId);

      const limitResult = await this.limitService.checkLimits(senderId, amount, now, tx);

      if (!limitResult.allowed) {
        // Insert FAILED record for audit trail, then return so the transaction commits it
        await this.transactionRepository.create(
          { senderId, recipientId, amount, currency: 'PHP', status: 'FAILED' },
          tx,
        );
        limitError = new LimitExceededError(limitResult.reason, limitResult.limit, limitResult.remaining);
        return;
      }

      result = await this.transactionRepository.create(
        { senderId, recipientId, amount, currency: 'PHP', status: 'COMPLETED' },
        tx,
      );
    });

    if (limitError) throw limitError;
    return result!;
  }

  async getTransactionHistory(
    userId: string,
    pagination: Partial<PaginationOptions>,
  ): Promise<PaginatedResult<TransactionHistoryItem>> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new UserNotFoundError(userId);

    const page = pagination.page ?? DEFAULT_PAGE;
    const pageSize = Math.min(pagination.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);

    const raw = await this.transactionRepository.findByUserId(userId, { page, pageSize });

    return {
      data: raw.data.map((tx) => ({
        id: tx.id,
        counterpartId: tx.senderId === userId ? tx.recipientId : tx.senderId,
        direction: tx.senderId === userId ? 'SENT' : 'RECEIVED',
        amount: tx.amount,
        currency: tx.currency,
        status: tx.status,
        createdAt: tx.createdAt,
      })),
      pagination: raw.pagination,
    };
  }
}
