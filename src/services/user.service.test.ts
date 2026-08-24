import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from './user.service';
import { DuplicateMobileNumberError, UserNotFoundError } from '../domain';

const mockUser = {
  id: 'user-uuid-1',
  mobileNumber: '+639171234001',
  firstName: 'Ana',
  lastName: 'Garcia',
  createdAt: new Date('2026-08-24T00:00:00Z'),
  updatedAt: new Date('2026-08-24T00:00:00Z'),
};

const mockRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findByMobileNumber: vi.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService(mockRepo as never);
  });

  describe('createUser', () => {
    it('returns the created user on success', async () => {
      mockRepo.create.mockResolvedValue(mockUser);

      const result = await service.createUser({
        mobileNumber: '+639171234001',
        firstName: 'Ana',
        lastName: 'Garcia',
      });

      expect(result).toEqual(mockUser);
      expect(mockRepo.create).toHaveBeenCalledWith({
        mobileNumber: '+639171234001',
        firstName: 'Ana',
        lastName: 'Garcia',
      });
    });

    it('surfaces DuplicateMobileNumberError from the repository', async () => {
      mockRepo.create.mockRejectedValue(new DuplicateMobileNumberError('+639171234001'));

      await expect(
        service.createUser({ mobileNumber: '+639171234001', firstName: 'Ana', lastName: 'Garcia' }),
      ).rejects.toThrow(DuplicateMobileNumberError);
    });
  });

  describe('getUserById', () => {
    it('returns the user when found', async () => {
      mockRepo.findById.mockResolvedValue(mockUser);

      const result = await service.getUserById('user-uuid-1');

      expect(result).toEqual(mockUser);
      expect(mockRepo.findById).toHaveBeenCalledWith('user-uuid-1');
    });

    it('throws UserNotFoundError when the repository returns null', async () => {
      mockRepo.findById.mockResolvedValue(null);

      await expect(service.getUserById('nonexistent-id')).rejects.toThrow(UserNotFoundError);
    });

    it('UserNotFoundError carries the requested userId', async () => {
      mockRepo.findById.mockResolvedValue(null);

      const err = await service.getUserById('missing-uuid').catch((e) => e);

      expect(err).toBeInstanceOf(UserNotFoundError);
      expect(err.userId).toBe('missing-uuid');
    });
  });
});
