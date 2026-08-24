import { randomUUID } from 'node:crypto';
import { DateTime } from 'luxon';
import { TransactionStatus } from '@prisma/client';
import type { User } from '../../src/domain';
import { testPrisma } from './db';

const PHT = 'Asia/Manila';

export async function createTestUser(
  overrides: Partial<{ mobileNumber: string; firstName: string; lastName: string }> = {},
): Promise<User> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 9);
  return testPrisma.user.create({
    data: {
      mobileNumber: overrides.mobileNumber ?? `+639${suffix}`,
      firstName: overrides.firstName ?? 'Test',
      lastName: overrides.lastName ?? 'User',
    },
  });
}

/** Today at the given PHT hour, as a UTC Date — always within the current PHT calendar day. */
export function phtToday(hour = 10): Date {
  return DateTime.now().setZone(PHT).startOf('day').plus({ hours: hour }).toJSDate();
}

/**
 * A moment earlier in the current PHT calendar month but outside today's PHT
 * calendar day, so it counts toward the monthly total without counting toward
 * the daily total. Falls back to "today" only when today is the 1st of the
 * month (the only day with no earlier day in the same month).
 */
export function phtEarlierThisMonth(hour = 9): Date {
  const now = DateTime.now().setZone(PHT);
  const targetDay = Math.max(1, now.day - 1);
  return now.startOf('month').plus({ days: targetDay - 1, hours: hour }).toJSDate();
}

export async function createCompletedTransaction(params: {
  senderId: string;
  recipientId: string;
  amount: string;
  createdAt: Date;
}): Promise<void> {
  await testPrisma.transaction.create({
    data: {
      senderId: params.senderId,
      recipientId: params.recipientId,
      amount: params.amount,
      currency: 'PHP',
      status: TransactionStatus.COMPLETED,
      createdAt: params.createdAt,
    },
  });
}
