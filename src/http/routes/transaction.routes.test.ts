import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerErrorHandler } from '../plugins/error-handler';
import { transactionRoutes } from './transaction.routes';
import {
  UserNotFoundError,
  LimitExceededError,
  SelfTransferError,
} from '../../domain';

const NOW = new Date('2026-08-24T10:00:00.000Z');
const SENDER_ID = 'a1b2c3d4-e5f6-4789-8abc-def012345678';
const RECIPIENT_ID = 'b2c3d4e5-f6a7-4890-9bcd-ef0123456789';

const mockTx = {
  id: 'tx-uuid-1',
  senderId: SENDER_ID,
  recipientId: RECIPIENT_ID,
  amount: '1500.00',
  currency: 'PHP',
  status: 'COMPLETED' as const,
  createdAt: NOW,
};

const mockLimitUsage = {
  userId: SENDER_ID,
  asOf: NOW,
  timezone: 'Asia/Manila' as const,
  daily: { limit: 50000, spent: '1500.00', remaining: '48500.00', resetsAt: new Date() },
  monthly: { limit: 500000, spent: '1500.00', remaining: '498500.00', resetsAt: new Date() },
};

const mockHistory = {
  data: [{ id: 'tx-1', counterpartId: RECIPIENT_ID, direction: 'SENT' as const, amount: '1500.00', currency: 'PHP', status: 'COMPLETED' as const, createdAt: NOW }],
  pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
};

const mockTransactionService = {
  sendMoney: vi.fn(),
  getTransactionHistory: vi.fn(),
};

const mockLimitService = {
  getLimitUsage: vi.fn(),
  checkLimits: vi.fn(),
};

function buildApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  app.register(transactionRoutes(mockTransactionService as never, mockLimitService as never), { prefix: '/api' });
  return app;
}

describe('Transaction Routes', () => {
  beforeEach(() => vi.resetAllMocks());

  describe('POST /api/transactions', () => {
    it('returns 201 with transaction on success', async () => {
      mockTransactionService.sendMoney.mockResolvedValue(mockTx);
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '1500.00' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('tx-uuid-1');
      expect(body.status).toBe('COMPLETED');
      expect(typeof body.createdAt).toBe('string');
    });

    it('returns 422 on LimitExceededError with remaining in details', async () => {
      mockTransactionService.sendMoney.mockRejectedValue(
        new LimitExceededError('DAILY_LIMIT_EXCEEDED', 50000, '0.00'),
      );
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' },
      });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error).toBe('DAILY_LIMIT_EXCEEDED');
      expect(body.details).toMatchObject({ remaining: '0.00', limit: 50000 });
    });

    it('returns 422 on SelfTransferError', async () => {
      mockTransactionService.sendMoney.mockRejectedValue(new SelfTransferError());
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 404 on UserNotFoundError', async () => {
      mockTransactionService.sendMoney.mockRejectedValue(new UserNotFoundError(SENDER_ID));
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '100.00' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 422 for invalid amount format', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '0' },
      });
      expect(res.statusCode).toBe(422);
    });

    it('returns 422 for amount with >2 decimal places', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/transactions',
        payload: { senderId: SENDER_ID, recipientId: RECIPIENT_ID, amount: '1.999' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('GET /api/users/:userId/limits', () => {
    it('returns 200 with limit usage', async () => {
      mockLimitService.getLimitUsage.mockResolvedValue(mockLimitUsage);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: `/api/users/${SENDER_ID}/limits` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.userId).toBe(SENDER_ID);
      expect(body.timezone).toBe('Asia/Manila');
      expect(typeof body.daily.spent).toBe('string');
      expect(typeof body.daily.resetsAt).toBe('string');
    });

    it('returns 404 on UserNotFoundError', async () => {
      mockLimitService.getLimitUsage.mockRejectedValue(new UserNotFoundError('x'));
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users/x/limits' });
      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /api/users/:userId/transactions', () => {
    it('returns 200 with paginated history', async () => {
      mockTransactionService.getTransactionHistory.mockResolvedValue(mockHistory);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: `/api/users/${SENDER_ID}/transactions` });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.pagination.total).toBe(1);
    });

    it('passes page and pageSize query params to service', async () => {
      mockTransactionService.getTransactionHistory.mockResolvedValue(mockHistory);
      const app = buildApp();
      await app.inject({ method: 'GET', url: `/api/users/${SENDER_ID}/transactions?page=2&pageSize=10` });
      expect(mockTransactionService.getTransactionHistory).toHaveBeenCalledWith(SENDER_ID, { page: 2, pageSize: 10 });
    });

    it('returns 404 on UserNotFoundError', async () => {
      mockTransactionService.getTransactionHistory.mockRejectedValue(new UserNotFoundError('x'));
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users/x/transactions' });
      expect(res.statusCode).toBe(404);
    });
  });
});
