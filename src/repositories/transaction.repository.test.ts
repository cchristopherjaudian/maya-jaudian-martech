import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { TransactionRepository } from './transaction.repository';

const NOW = new Date('2026-08-24T10:00:00Z');
const DAY_START = new Date('2026-08-24T00:00:00Z'); // midnight PHT = 16:00 UTC prev day; simplified for unit test
const DAY_END = new Date('2026-08-25T00:00:00Z');

const mockTx = {
  id: 'tx-uuid-1',
  senderId: 'user-uuid-1',
  recipientId: 'user-uuid-2',
  amount: new Prisma.Decimal('5000.00'),
  currency: 'PHP',
  status: 'COMPLETED' as const,
  createdAt: NOW,
};

const mockPrisma = {
  transaction: {
    create: vi.fn(),
    aggregate: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
  },
};

describe('TransactionRepository', () => {
  let repo: TransactionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new TransactionRepository(mockPrisma as never);
  });

  describe('create', () => {
    it('inserts and returns the mapped transaction using the default client', async () => {
      mockPrisma.transaction.create.mockResolvedValue(mockTx);

      const result = await repo.create({
        senderId: 'user-uuid-1',
        recipientId: 'user-uuid-2',
        amount: '5000.00',
        currency: 'PHP',
        status: 'COMPLETED',
      });

      expect(result.amount).toBe('5000.00');
      expect(result.status).toBe('COMPLETED');
      expect(result.senderId).toBe('user-uuid-1');
      expect(mockPrisma.transaction.create).toHaveBeenCalledOnce();
    });

    it('uses the provided tx client when given', async () => {
      const txClient = { transaction: { create: vi.fn().mockResolvedValue(mockTx) } };

      await repo.create(
        { senderId: 'user-uuid-1', recipientId: 'user-uuid-2', amount: '5000.00', currency: 'PHP', status: 'COMPLETED' },
        txClient as never,
      );

      expect(txClient.transaction.create).toHaveBeenCalledOnce();
      expect(mockPrisma.transaction.create).not.toHaveBeenCalled();
    });
  });

  describe('sumByPeriod', () => {
    it('returns the formatted decimal sum for completed transactions in range', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({
        _sum: { amount: new Prisma.Decimal('12500.50') },
      });

      const result = await repo.sumByPeriod('user-uuid-1', { start: DAY_START, end: DAY_END });

      expect(result).toBe('12500.50');
      expect(mockPrisma.transaction.aggregate).toHaveBeenCalledWith({
        _sum: { amount: true },
        where: {
          senderId: 'user-uuid-1',
          status: 'COMPLETED',
          createdAt: { gte: DAY_START, lt: DAY_END },
        },
      });
    });

    it('returns "0.00" when no completed transactions exist in the range', async () => {
      mockPrisma.transaction.aggregate.mockResolvedValue({ _sum: { amount: null } });

      const result = await repo.sumByPeriod('user-uuid-1', { start: DAY_START, end: DAY_END });

      expect(result).toBe('0.00');
    });

    it('uses the provided tx client for the aggregate query', async () => {
      const txClient = {
        transaction: {
          aggregate: vi.fn().mockResolvedValue({ _sum: { amount: new Prisma.Decimal('3000.00') } }),
        },
      };

      const result = await repo.sumByPeriod(
        'user-uuid-1',
        { start: DAY_START, end: DAY_END },
        txClient as never,
      );

      expect(result).toBe('3000.00');
      expect(txClient.transaction.aggregate).toHaveBeenCalledOnce();
      expect(mockPrisma.transaction.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('findByUserId', () => {
    const rows = [mockTx, { ...mockTx, id: 'tx-uuid-2', senderId: 'user-uuid-2', recipientId: 'user-uuid-1' }];

    it('returns paginated transactions for the user as sender or recipient', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue(rows);
      mockPrisma.transaction.count.mockResolvedValue(2);

      const result = await repo.findByUserId('user-uuid-1', { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.pagination).toEqual({ page: 1, pageSize: 20, total: 2, totalPages: 1 });
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith({
        where: { OR: [{ senderId: 'user-uuid-1' }, { recipientId: 'user-uuid-1' }] },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
    });

    it('calculates correct skip offset for page 2', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([]);
      mockPrisma.transaction.count.mockResolvedValue(25);

      const result = await repo.findByUserId('user-uuid-1', { page: 2, pageSize: 10 });

      expect(result.pagination.totalPages).toBe(3);
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('maps Prisma Decimal amounts to strings', async () => {
      mockPrisma.transaction.findMany.mockResolvedValue([mockTx]);
      mockPrisma.transaction.count.mockResolvedValue(1);

      const result = await repo.findByUserId('user-uuid-1', { page: 1, pageSize: 20 });

      expect(typeof result.data[0].amount).toBe('string');
      expect(result.data[0].amount).toBe('5000.00');
    });
  });
});
