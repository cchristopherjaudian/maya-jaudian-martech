import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerErrorHandler } from '../plugins/error-handler';
import { userRoutes } from './user.routes';
import { UserNotFoundError, DuplicateMobileNumberError } from '../../domain';

const NOW = new Date('2026-08-24T10:00:00.000Z');

const mockUser = {
  id: 'user-uuid-1',
  mobileNumber: '+639171234001',
  firstName: 'Ana',
  lastName: 'Garcia',
  createdAt: NOW,
  updatedAt: NOW,
};

const mockUserService = {
  createUser: vi.fn(),
  getUserById: vi.fn(),
  listUsers: vi.fn(),
};

function buildApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);
  app.register(userRoutes(mockUserService as never), { prefix: '/api' });
  return app;
}

describe('User Routes', () => {
  beforeEach(() => vi.resetAllMocks());

  describe('GET /api/users', () => {
    it('returns 200 with an array of users', async () => {
      mockUserService.listUsers.mockResolvedValue([mockUser]);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(Array.isArray(body)).toBe(true);
      expect(body[0].id).toBe('user-uuid-1');
      expect(typeof body[0].createdAt).toBe('string');
    });

    it('returns an empty array when no users exist', async () => {
      mockUserService.listUsers.mockResolvedValue([]);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe('POST /api/users', () => {
    it('returns 201 with user response on success', async () => {
      mockUserService.createUser.mockResolvedValue(mockUser);
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: { mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' },
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe('user-uuid-1');
      expect(body.mobileNumber).toBe('+639171234001');
      expect(typeof body.createdAt).toBe('string');
    });

    it('returns 409 on DuplicateMobileNumberError', async () => {
      mockUserService.createUser.mockRejectedValue(new DuplicateMobileNumberError('+639171234001'));
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: { mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' },
      });
      expect(res.statusCode).toBe(409);
      expect(res.json().error).toBe('DUPLICATE_MOBILE_NUMBER');
    });

    it('returns 422 when body is missing required fields', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: { firstName: 'Ana' },
      });
      expect(res.statusCode).toBe(422);
    });
  });

  describe('GET /api/users/:userId', () => {
    it('returns 200 with user response when found', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users/user-uuid-1' });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('user-uuid-1');
    });

    it('returns 404 when UserNotFoundError', async () => {
      mockUserService.getUserById.mockRejectedValue(new UserNotFoundError('missing-id'));
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users/missing-id' });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('USER_NOT_FOUND');
    });
  });
});
