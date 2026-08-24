import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandler } from './error-handler';
import {
  UserNotFoundError,
  DuplicateMobileNumberError,
  SelfTransferError,
  LimitExceededError,
  InvalidAmountError,
} from '../../domain';

function buildApp() {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);
  return app;
}

function addThrowingRoute(app: ReturnType<typeof Fastify>, err: Error) {
  app.get('/throw', async () => { throw err; });
}

describe('registerErrorHandler', () => {
  it('maps UserNotFoundError to 404', async () => {
    const app = buildApp();
    addThrowingRoute(app, new UserNotFoundError('uuid-123'));
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(404);
    const body = res.json();
    expect(body.error).toBe('USER_NOT_FOUND');
    expect(body.statusCode).toBe(404);
    expect(body.details).toMatchObject({ userId: 'uuid-123' });
  });

  it('maps DuplicateMobileNumberError to 409', async () => {
    const app = buildApp();
    addThrowingRoute(app, new DuplicateMobileNumberError('+63917'));
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('DUPLICATE_MOBILE_NUMBER');
  });

  it('maps SelfTransferError to 422', async () => {
    const app = buildApp();
    addThrowingRoute(app, new SelfTransferError());
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('SELF_TRANSFER_NOT_ALLOWED');
  });

  it('maps LimitExceededError to 422 with details', async () => {
    const app = buildApp();
    addThrowingRoute(app, new LimitExceededError('DAILY_LIMIT_EXCEEDED', 50000, '100.00'));
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('DAILY_LIMIT_EXCEEDED');
    expect(body.details).toMatchObject({ remaining: '100.00', limit: 50000 });
  });

  it('maps InvalidAmountError to 422', async () => {
    const app = buildApp();
    addThrowingRoute(app, new InvalidAmountError());
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('INVALID_AMOUNT');
  });

  it('maps unknown errors to 500', async () => {
    const app = buildApp();
    addThrowingRoute(app, new Error('boom'));
    const res = await app.inject({ method: 'GET', url: '/throw' });
    expect(res.statusCode).toBe(500);
    expect(res.json().error).toBe('INTERNAL_SERVER_ERROR');
  });

  it('response body has statusCode, error, message fields', async () => {
    const app = buildApp();
    addThrowingRoute(app, new UserNotFoundError('x'));
    const res = await app.inject({ method: 'GET', url: '/throw' });
    const body = res.json();
    expect(typeof body.statusCode).toBe('number');
    expect(typeof body.error).toBe('string');
    expect(typeof body.message).toBe('string');
  });
});
