import { randomUUID } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/build-app';
import { createTestUser, createCompletedTransaction, phtToday } from './helpers/factories';

describe('GET /api/users/:userId/limits (integration)', () => {
  async function app(): Promise<FastifyInstance> {
    return buildTestApp();
  }

  it('returns zero spent and full remaining for a fresh user with no transactions', async () => {
    const user = await createTestUser();
    const fastify = await app();

    const res = await fastify.inject({ method: 'GET', url: `/api/users/${user.id}/limits` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.daily).toMatchObject({ limit: 50000, spent: '0.00', remaining: '50000.00' });
    expect(body.monthly).toMatchObject({ limit: 500000, spent: '0.00', remaining: '500000.00' });
  });

  it('reflects spent and remaining after a known completed transaction', async () => {
    const sender = await createTestUser();
    const recipient = await createTestUser();
    await createCompletedTransaction({
      senderId: sender.id,
      recipientId: recipient.id,
      amount: '1500.00',
      createdAt: phtToday(10),
    });
    const fastify = await app();

    const res = await fastify.inject({ method: 'GET', url: `/api/users/${sender.id}/limits` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.daily).toMatchObject({ spent: '1500.00', remaining: '48500.00' });
    expect(body.monthly).toMatchObject({ spent: '1500.00', remaining: '498500.00' });
  });

  it('returns 404 when the user does not exist', async () => {
    const fastify = await app();
    const res = await fastify.inject({ method: 'GET', url: `/api/users/${randomUUID()}/limits` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('USER_NOT_FOUND');
  });
});

describe('GET /api/users/:userId/transactions (integration)', () => {
  async function app(): Promise<FastifyInstance> {
    return buildTestApp();
  }

  it('returns both sent and received transactions with correct direction', async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await createCompletedTransaction({
      senderId: user.id,
      recipientId: other.id,
      amount: '100.00',
      createdAt: phtToday(9),
    });
    await createCompletedTransaction({
      senderId: other.id,
      recipientId: user.id,
      amount: '200.00',
      createdAt: phtToday(10),
    });
    const fastify = await app();

    const res = await fastify.inject({ method: 'GET', url: `/api/users/${user.id}/transactions` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    const directions = body.data.map((t: { direction: string }) => t.direction).sort();
    expect(directions).toEqual(['RECEIVED', 'SENT']);
  });

  it('applies pagination and reports accurate metadata', async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    for (let i = 0; i < 25; i += 1) {
      await createCompletedTransaction({
        senderId: user.id,
        recipientId: other.id,
        amount: '10.00',
        createdAt: phtToday(9),
      });
    }
    const fastify = await app();

    const defaultRes = await fastify.inject({ method: 'GET', url: `/api/users/${user.id}/transactions` });
    const defaultBody = defaultRes.json();
    expect(defaultBody.pagination).toMatchObject({ page: 1, pageSize: 20, total: 25, totalPages: 2 });
    expect(defaultBody.data).toHaveLength(20);

    const pagedRes = await fastify.inject({
      method: 'GET',
      url: `/api/users/${user.id}/transactions?page=2&pageSize=10`,
    });
    const pagedBody = pagedRes.json();
    expect(pagedBody.pagination).toMatchObject({ page: 2, pageSize: 10, total: 25, totalPages: 3 });
    expect(pagedBody.data).toHaveLength(10);
  });

  it('returns 404 when the user does not exist', async () => {
    const fastify = await app();
    const res = await fastify.inject({ method: 'GET', url: `/api/users/${randomUUID()}/transactions` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('USER_NOT_FOUND');
  });
});
