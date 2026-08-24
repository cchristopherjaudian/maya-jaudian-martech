import { Prisma, PrismaClient } from '@prisma/client';
import { DuplicateMobileNumberError } from '../domain';
import type { CreateUserDto, User } from '../domain';

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: CreateUserDto): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DuplicateMobileNumberError(data.mobileNumber);
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByMobileNumber(mobileNumber: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { mobileNumber } });
  }

  async findAll(): Promise<User[]> {
    return this.prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
