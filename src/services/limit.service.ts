import { DateTime } from 'luxon';
import { Prisma } from '@prisma/client';
import { DAILY_LIMIT, MONTHLY_LIMIT } from '../domain';
import type { LimitCheckResult, LimitUsage, PeriodBoundary } from '../domain';
import type { PrismaTransactionClient } from '../infrastructure/database';
import type { TransactionRepository } from '../repositories/transaction.repository';

const PHT = 'Asia/Manila';

export class LimitService {
  constructor(private readonly transactionRepo: TransactionRepository) {}

  private getDailyBoundary(now: Date): PeriodBoundary {
    const pht = DateTime.fromJSDate(now).setZone(PHT);
    return {
      start: pht.startOf('day').toUTC().toJSDate(),
      end: pht.startOf('day').plus({ days: 1 }).toUTC().toJSDate(),
    };
  }

  private getMonthlyBoundary(now: Date): PeriodBoundary {
    const pht = DateTime.fromJSDate(now).setZone(PHT);
    return {
      start: pht.startOf('month').toUTC().toJSDate(),
      end: pht.startOf('month').plus({ months: 1 }).toUTC().toJSDate(),
    };
  }

  private clampedRemaining(limit: number, spent: Prisma.Decimal): string {
    const rem = new Prisma.Decimal(limit).minus(spent);
    return (rem.isNegative() ? new Prisma.Decimal(0) : rem).toFixed(2);
  }

  async checkLimits(
    senderId: string,
    amount: string,
    now: Date,
    tx?: PrismaTransactionClient,
  ): Promise<LimitCheckResult> {
    const amountDec = new Prisma.Decimal(amount);

    const dailySpentStr = await this.transactionRepo.sumByPeriod(
      senderId,
      this.getDailyBoundary(now),
      tx,
    );
    const dailySpent = new Prisma.Decimal(dailySpentStr);

    if (dailySpent.plus(amountDec).greaterThan(DAILY_LIMIT)) {
      return {
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        limit: DAILY_LIMIT,
        remaining: this.clampedRemaining(DAILY_LIMIT, dailySpent),
      };
    }

    const monthlySpentStr = await this.transactionRepo.sumByPeriod(
      senderId,
      this.getMonthlyBoundary(now),
      tx,
    );
    const monthlySpent = new Prisma.Decimal(monthlySpentStr);

    if (monthlySpent.plus(amountDec).greaterThan(MONTHLY_LIMIT)) {
      return {
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        limit: MONTHLY_LIMIT,
        remaining: this.clampedRemaining(MONTHLY_LIMIT, monthlySpent),
      };
    }

    return { allowed: true };
  }

  async getLimitUsage(userId: string, now: Date): Promise<LimitUsage> {
    const dailyBoundary = this.getDailyBoundary(now);
    const monthlyBoundary = this.getMonthlyBoundary(now);

    const [dailySpentStr, monthlySpentStr] = await Promise.all([
      this.transactionRepo.sumByPeriod(userId, dailyBoundary),
      this.transactionRepo.sumByPeriod(userId, monthlyBoundary),
    ]);

    const dailySpent = new Prisma.Decimal(dailySpentStr);
    const monthlySpent = new Prisma.Decimal(monthlySpentStr);

    return {
      userId,
      asOf: now,
      timezone: PHT,
      daily: {
        limit: DAILY_LIMIT,
        spent: dailySpent.toFixed(2),
        remaining: this.clampedRemaining(DAILY_LIMIT, dailySpent),
        resetsAt: dailyBoundary.end,
      },
      monthly: {
        limit: MONTHLY_LIMIT,
        spent: monthlySpent.toFixed(2),
        remaining: this.clampedRemaining(MONTHLY_LIMIT, monthlySpent),
        resetsAt: monthlyBoundary.end,
      },
    };
  }
}
