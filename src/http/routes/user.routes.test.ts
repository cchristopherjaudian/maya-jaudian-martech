import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { registerErrorHandler } from '../plugins/error-handler';
import { userRoutes } from './user.routes';
import { UserNotFoundError, DuplicateMobileNumberError } from '../../domain';

const NOW = new Date('2026-08-24T10:00:00.000Z');
const USER_ID = 'a1b2c3d4-e5f6-4789-8abc-def012345678';
const MISSING_USER_ID = 'b2c3d4e5-f6a7-4890-9bcd-ef0123456789';

const mockUser = {
  id: USER_ID,
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
      expect(body[0].id).toBe(USER_ID);
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
      expect(body.id).toBe(USER_ID);
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

    it('returns 422 VALIDATION_ERROR for a non-E.164 mobile number, without calling the service', async () => {
      const app = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/users',
        payload: { mobileNumber: '09171234567', firstName: 'Ana', lastName: 'Garcia' },
      });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('VALIDATION_ERROR');
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/users/:userId', () => {
    it('returns 200 with user response when found', async () => {
      mockUserService.getUserById.mockResolvedValue(mockUser);
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: `/api/users/${USER_ID}` });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe(USER_ID);
    });

    it('returns 404 when UserNotFoundError', async () => {
      mockUserService.getUserById.mockRejectedValue(new UserNotFoundError(MISSING_USER_ID));
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: `/api/users/${MISSING_USER_ID}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe('USER_NOT_FOUND');
    });

    it('returns 422 VALIDATION_ERROR when userId is not a well-formed UUID, without reaching the service', async () => {
      const app = buildApp();
      const res = await app.inject({ method: 'GET', url: '/api/users/not-a-uuid' });
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe('VALIDATION_ERROR');
      expect(mockUserService.getUserById).not.toHaveBeenCalled();
    });
  });
});
