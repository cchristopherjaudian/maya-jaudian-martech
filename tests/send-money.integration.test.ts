import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/build-app';
import { createTestUser, createCompletedTransaction, phtToday, phtEarlierThisMonth } from './helpers/factories';

describe('POST /api/transactions (integration)', () => {
  async function app(): Promise<FastifyInstance> {
    return buildTestApp();
  }

  it('happy path: persists a COMPLETED transaction and returns 201', async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    const fastify = await app();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { senderId: sender.id, recipientId: recipient.id, amount: '1500.00' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(typeof body.id).toBe('string');
    expect(body.senderId).toBe(sender.id);
    expect(body.recipientId).toBe(recipient.id);
    expect(body.amount).toBe('1500.00');
    expect(body.currency).toBe('PHP');
    expect(body.status).toBe('COMPLETED');
    expect(() => new Date(body.createdAt).toISOString()).not.toThrow();
    expect(new Date(body.createdAt).toISOString()).toBe(body.createdAt);
  });

  it('rejects with 422 DAILY_LIMIT_EXCEEDED when the daily cap would be breached', async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await createCompletedTransaction({
      senderId: sender.id,
      recipientId: recipient.id,
      amount: '49999.99',
      createdAt: phtToday(8),
    });
    const fastify = await app();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { senderId: sender.id, recipientId: recipient.id, amount: '0.02' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('DAILY_LIMIT_EXCEEDED');
    // spent 49999.99 + 0.02 > 50000 daily cap; remaining = 50000 - 49999.99 = 0.01
    expect(body.details.remaining).toBe('0.01');
    expect(body.details.limit).toBe(50000);
  });

  it('rejects with 422 MONTHLY_LIMIT_EXCEEDED when the monthly cap would be breached', async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await createCompletedTransaction({
      senderId: sender.id,
      recipientId: recipient.id,
      amount: '499999.99',
      createdAt: phtEarlierThisMonth(9),
    });
    const fastify = await app();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { senderId: sender.id, recipientId: recipient.id, amount: '0.02' },
    });

    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('MONTHLY_LIMIT_EXCEEDED');
    expect(body.details.remaining).toBe('0.01');
    expect(body.details.limit).toBe(500000);
  });

  it('returns 404 USER_NOT_FOUND when the sender does not exist', async () => {
    const recipient = await createTestUser();
    const fastify = await app();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { senderId: randomUUID(), recipientId: recipient.id, amount: '100.00' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('USER_NOT_FOUND');
  });

  it('returns 404 USER_NOT_FOUND when the recipient does not exist', async () => {
    const sender = await createTestUser();
    const fastify = await app();

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/transactions',
      payload: { senderId: sender.id, recipientId: randomUUID(), amount: '100.00' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('USER_NOT_FOUND');
  });
});
