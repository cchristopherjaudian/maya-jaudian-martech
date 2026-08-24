import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TransactionService } from './transaction.service';
import {
  SelfTransferError,
  UserNotFoundError,
  LimitExceededError,
} from '../domain';

const NOW = new Date('2026-08-24T10:00:00.000Z');
const SENDER_ID = 'sender-uuid';
const RECIPIENT_ID = 'recipient-uuid';

const mockSender = {
  id: SENDER_ID,
  mobileNumber: '+639171234001',
  firstName: 'Ana',
  lastName: 'Garcia',
  createdAt: NOW,
  updatedAt: NOW,
};

const mockRecipient = {
  id: RECIPIENT_ID,
  mobileNumber: '+639171234002',
  firstName: 'Juan',
  lastName: 'Dela Cruz',
  createdAt: NOW,
  updatedAt: NOW,
};

const mockCompletedTx = {
  id: 'tx-uuid-1',
  senderId: SENDER_ID,
  recipientId: RECIPIENT_ID,
  amount: '1500.00',
  currency: 'PHP',
  status: 'COMPLETED' as const,
  createdAt: NOW,
};

const mockTxClient = { $queryRaw: vi.fn().mockResolvedValue([]) };

const mockPrisma = {
  $transaction: vi.fn().mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) => cb(mockTxClient)),
};

const mockUserRepo = {
  findById: vi.fn(),
  create: vi.fn(),
  findByMobileNumber: vi.fn(),
};

const mockLimitService = {
  checkLimits: vi.fn(),
  getLimitUsage: vi.fn(),
};

const mockTransactionRepo = {
  create: vi.fn(),
  sumByPeriod: vi.fn(),
  findByUserId: vi.fn(),
};

describe('TransactionService', () => {
  let service: TransactionService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockTxClient.$queryRaw.mockResolvedValue([]);
    mockPrisma.$transaction.mockImplementation(async (cb: (tx: typeof mockTxClient) => Promise<unknown>) => cb(mockTxClient));
    service = new TransactionService(
      mockPrisma as never,
      mockUserRepo as never,
      mockLimitService as never,
      mockTransactionRepo as never,
    );
  });

  // ─── Task 7.1: sendMoney ───────────────────────────────────────────────────

  describe('sendMoney', () => {
    it('throws SelfTransferError immediately when senderId equals recipientId', async () => {
      await expect(
        service.sendMoney({ senderId: 'same-id', recipientId: 'same-id', amount: '100.00' }, NOW),
      ).rejects.toThrow(SelfTransferError);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws UserNotFoundError when sender does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW),
      ).rejects.toThrow(UserNotFoundError);
    });

    it('throws UserNotFoundError when recipient does not exist', async () => {
      mockUserRepo.findById
        .mockResolvedValueOnce(mockSender)
        .mockResolvedValueOnce(null);

      await expect(
        service.sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW),
      ).rejects.toThrow(UserNotFoundError);
    });

    it('issues SELECT FOR UPDATE on sender row inside the transaction', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockLimitService.checkLimits.mockResolvedValue({ allowed: true });
      mockTransactionRepo.create.mockResolvedValue(mockCompletedTx);

      await service.sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW);

      expect(mockTxClient.$queryRaw).toHaveBeenCalledOnce();
    });

    it('passes the tx client to checkLimits', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockLimitService.checkLimits.mockResolvedValue({ allowed: true });
      mockTransactionRepo.create.mockResolvedValue(mockCompletedTx);

      await service.sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW);

      expect(mockLimitService.checkLimits).toHaveBeenCalledWith(
        SENDER_ID,
        '100.00',
        NOW,
        mockTxClient,
      );
    });

    it('inserts a COMPLETED transaction and returns it on success', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockLimitService.checkLimits.mockResolvedValue({ allowed: true });
      mockTransactionRepo.create.mockResolvedValue(mockCompletedTx);

      const result = await service.sendMoney(
        { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '1500.00' },
        NOW,
      );

      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, status: 'COMPLETED' }),
        mockTxClient,
      );
      expect(result.status).toBe('COMPLETED');
      expect(result.amount).toBe('1500.00');
    });

    it('inserts a FAILED transaction and throws LimitExceededError on limit breach', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockLimitService.checkLimits.mockResolvedValue({
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        limit: 50_000,
        remaining: '0.01',
      });
      mockTransactionRepo.create.mockResolvedValue({
        ...mockCompletedTx,
        status: 'FAILED',
      });

      await expect(
        service.sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW),
      ).rejects.toThrow(LimitExceededError);

      expect(mockTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED' }),
        mockTxClient,
      );
    });

    it('LimitExceededError carries reason, limit, and remaining', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockLimitService.checkLimits.mockResolvedValue({
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        limit: 500_000,
        remaining: '1000.00',
      });
      mockTransactionRepo.create.mockResolvedValue({ ...mockCompletedTx, status: 'FAILED' });

      const err = await service
        .sendMoney({ senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' }, NOW)
        .catch((e) => e);

      expect(err).toBeInstanceOf(LimitExceededError);
      expect(err.reason).toBe('MONTHLY_LIMIT_EXCEEDED');
      expect(err.limit).toBe(500_000);
      expect(err.remaining).toBe('1000.00');
    });
  });

  // ─── Task 7.2: getTransactionHistory ──────────────────────────────────────

  describe('getTransactionHistory', () => {
    const rawTxSent = { ...mockCompletedTx, senderId: SENDER_ID, recipientId: RECIPIENT_ID };
    const rawTxReceived = { ...mockCompletedTx, id: 'tx-2', senderId: RECIPIENT_ID, recipientId: SENDER_ID };

    it('throws UserNotFoundError when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValue(null);

      await expect(
        service.getTransactionHistory(SENDER_ID, { page: 1, pageSize: 20 }),
      ).rejects.toThrow(UserNotFoundError);
    });

    it('enriches transactions with direction SENT when userId is the sender', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockTransactionRepo.findByUserId.mockResolvedValue({
        data: [rawTxSent],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });

      const result = await service.getTransactionHistory(SENDER_ID, { page: 1, pageSize: 20 });

      expect(result.data[0].direction).toBe('SENT');
      expect(result.data[0].counterpartId).toBe(RECIPIENT_ID);
    });

    it('enriches transactions with direction RECEIVED when userId is the recipient', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockTransactionRepo.findByUserId.mockResolvedValue({
        data: [rawTxReceived],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });

      const result = await service.getTransactionHistory(SENDER_ID, { page: 1, pageSize: 20 });

      expect(result.data[0].direction).toBe('RECEIVED');
      expect(result.data[0].counterpartId).toBe(RECIPIENT_ID);
    });

    it('defaults page to 1 and pageSize to 20 when not provided', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockTransactionRepo.findByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      });

      await service.getTransactionHistory(SENDER_ID, {});

      expect(mockTransactionRepo.findByUserId).toHaveBeenCalledWith(
        SENDER_ID,
        { page: 1, pageSize: 20 },
      );
    });

    it('caps pageSize at 100', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockTransactionRepo.findByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 },
      });

      await service.getTransactionHistory(SENDER_ID, { page: 1, pageSize: 500 });

      expect(mockTransactionRepo.findByUserId).toHaveBeenCalledWith(
        SENDER_ID,
        { page: 1, pageSize: 100 },
      );
    });

    it('returns pagination metadata unchanged from the repository', async () => {
      mockUserRepo.findById.mockResolvedValue(mockSender);
      mockTransactionRepo.findByUserId.mockResolvedValue({
        data: [],
        pagination: { page: 2, pageSize: 10, total: 25, totalPages: 3 },
      });

      const result = await service.getTransactionHistory(SENDER_ID, { page: 2, pageSize: 10 });

      expect(result.pagination).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
    });
  });
});
