import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';
import { UserRepository } from './user.repository';
import { DuplicateMobileNumberError } from '../domain';

const mockUser = {
  id: 'user-uuid-1',
  mobileNumber: '+639171234001',
  firstName: 'Ana',
  lastName: 'Garcia',
  createdAt: new Date('2026-08-24T00:00:00Z'),
  updatedAt: new Date('2026-08-24T00:00:00Z'),
};

const mockPrisma = {
  user: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
  },
};

describe('UserRepository', () => {
  let repo: UserRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new UserRepository(mockPrisma as never);
  });

  describe('create', () => {
    it('returns the persisted user on success', async () => {
      mockPrisma.user.create.mockResolvedValue(mockUser);

      const result = await repo.create({
        mobileNumber: '+639171234001',
        firstName: 'Ana',
        lastName: 'Garcia',
      });

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' },
      });
    });

    it('throws DuplicateMobileNumberError on P2002 unique constraint violation', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`mobile_number`)',
        { code: 'P2002', clientVersion: '7.0.0' },
      );
      mockPrisma.user.create.mockRejectedValue(prismaError);

      await expect(
        repo.create({ mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' }),
      ).rejects.toThrow(DuplicateMobileNumberError);
    });

    it('rethrows non-P2002 errors unchanged', async () => {
      const dbError = new Error('Connection lost');
      mockPrisma.user.create.mockRejectedValue(dbError);

      await expect(
        repo.create({ mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' }),
      ).rejects.toThrow('Connection lost');
    });
  });

  describe('findById', () => {
    it('returns the user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await repo.findById('user-uuid-1');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-uuid-1' } });
    });

    it('returns null when user does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await repo.findById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('findAll', () => {
    it('returns all users ordered by createdAt descending', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser]);

      const result = await repo.findAll();

      expect(result).toEqual([mockUser]);
      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('returns an empty array when no users exist', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      const result = await repo.findAll();

      expect(result).toEqual([]);
    });
  });

  describe('findByMobileNumber', () => {
    it('returns the user when found', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await repo.findByMobileNumber('+639171234001');

      expect(result).toEqual(mockUser);
      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { mobileNumber: '+639171234001' },
      });
    });

    it('returns null when mobile number does not exist', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await repo.findByMobileNumber('+63999999999');

      expect(result).toBeNull();
    });
  });
});
