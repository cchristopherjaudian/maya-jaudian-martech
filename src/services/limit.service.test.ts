import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LimitService } from './limit.service';
import { DAILY_LIMIT, MONTHLY_LIMIT } from '../domain';

// now = 2026-08-24T10:00:00Z → PHT 2026-08-24T18:00:00+08:00
const NOW = new Date('2026-08-24T10:00:00.000Z');

// PHT midnight 2026-08-24 → UTC 2026-08-23T16:00:00Z
const DAILY_START = new Date('2026-08-23T16:00:00.000Z');
// PHT midnight 2026-08-25 → UTC 2026-08-24T16:00:00Z
const DAILY_END = new Date('2026-08-24T16:00:00.000Z');

// PHT 2026-08-01T00:00:00+08:00 → UTC 2026-07-31T16:00:00Z
const MONTHLY_START = new Date('2026-07-31T16:00:00.000Z');
// PHT 2026-09-01T00:00:00+08:00 → UTC 2026-08-31T16:00:00Z
const MONTHLY_END = new Date('2026-08-31T16:00:00.000Z');

const mockRepo = { sumByPeriod: vi.fn() };

describe('LimitService', () => {
  let service: LimitService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new LimitService(mockRepo as never);
  });

  // ─── Task 6.1: boundary computation ────────────────────────────────────────

  describe('period boundaries (tested via sumByPeriod call args)', () => {
    beforeEach(() => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');
    });

    it('calls sumByPeriod with correct UTC daily boundary', async () => {
      await service.checkLimits('uid', '1.00', NOW);

      expect(mockRepo.sumByPeriod).toHaveBeenCalledWith(
        'uid',
        { start: DAILY_START, end: DAILY_END },
        undefined,
      );
    });

    it('calls sumByPeriod with correct UTC monthly boundary', async () => {
      await service.checkLimits('uid', '1.00', NOW);

      expect(mockRepo.sumByPeriod).toHaveBeenCalledWith(
        'uid',
        { start: MONTHLY_START, end: MONTHLY_END },
        undefined,
      );
    });

    it('daily resetsAt is midnight of the next PHT day in UTC', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');
      const usage = await service.getLimitUsage('uid', NOW);
      expect(usage.daily.resetsAt.toISOString()).toBe(DAILY_END.toISOString());
    });

    it('monthly resetsAt is midnight of the first day of next PHT month in UTC', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');
      const usage = await service.getLimitUsage('uid', NOW);
      expect(usage.monthly.resetsAt.toISOString()).toBe(MONTHLY_END.toISOString());
    });
  });

  // ─── Task 9.1: PHT timezone reset boundaries ───────────────────────────────

  describe('PHT daily reset boundary', () => {
    // Last millisecond of PHT day 2026-08-24 → 2026-08-24T15:59:59.999Z
    const LAST_MS_OF_DAY_PHT = new Date('2026-08-24T15:59:59.999Z');
    // First millisecond of PHT day 2026-08-25 → 2026-08-24T16:00:00.000Z
    const FIRST_MS_OF_NEXT_DAY_PHT = new Date('2026-08-24T16:00:00.000Z');

    it('23:59:59.999 PHT counts in the current day (boundary start = prev midnight PHT)', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.checkLimits('uid', '1.00', LAST_MS_OF_DAY_PHT);

      const [, dailyPeriod] = mockRepo.sumByPeriod.mock.calls[0];
      // PHT day is 2026-08-24, so UTC start = 2026-08-23T16:00:00Z
      expect(dailyPeriod.start.toISOString()).toBe('2026-08-23T16:00:00.000Z');
      expect(dailyPeriod.end.toISOString()).toBe('2026-08-24T16:00:00.000Z');
    });

    it('00:00:00.000 PHT of the next day falls in a new period (boundary start = midnight PHT today)', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.checkLimits('uid', '1.00', FIRST_MS_OF_NEXT_DAY_PHT);

      const [, dailyPeriod] = mockRepo.sumByPeriod.mock.calls[0];
      // PHT day is now 2026-08-25, so UTC start = 2026-08-24T16:00:00Z
      expect(dailyPeriod.start.toISOString()).toBe('2026-08-24T16:00:00.000Z');
      expect(dailyPeriod.end.toISOString()).toBe('2026-08-25T16:00:00.000Z');
    });
  });

  describe('PHT monthly reset boundary', () => {
    // Last millisecond of PHT August 2026 → 2026-08-31T15:59:59.999Z
    const LAST_MS_OF_MONTH_PHT = new Date('2026-08-31T15:59:59.999Z');
    // First millisecond of PHT September 2026 → 2026-08-31T16:00:00.000Z
    const FIRST_MS_OF_NEXT_MONTH_PHT = new Date('2026-08-31T16:00:00.000Z');

    it('last millisecond of PHT month counts in that month', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.checkLimits('uid', '1.00', LAST_MS_OF_MONTH_PHT);

      const [, monthlyPeriod] = mockRepo.sumByPeriod.mock.calls[1];
      // PHT month is August 2026, UTC start = 2026-07-31T16:00:00Z
      expect(monthlyPeriod.start.toISOString()).toBe('2026-07-31T16:00:00.000Z');
      expect(monthlyPeriod.end.toISOString()).toBe('2026-08-31T16:00:00.000Z');
    });

    it('first millisecond of PHT next month starts a fresh period', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.checkLimits('uid', '1.00', FIRST_MS_OF_NEXT_MONTH_PHT);

      const [, monthlyPeriod] = mockRepo.sumByPeriod.mock.calls[1];
      // PHT month is now September 2026, UTC start = 2026-08-31T16:00:00Z
      expect(monthlyPeriod.start.toISOString()).toBe('2026-08-31T16:00:00.000Z');
      expect(monthlyPeriod.end.toISOString()).toBe('2026-09-30T16:00:00.000Z');
    });
  });

  describe('exact limit boundaries', () => {
    it('allows a transaction that brings monthly total to exactly ₱500,000', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('0.00')        // daily — no issue
        .mockResolvedValueOnce('499000.00');  // monthly spent

      const result = await service.checkLimits('uid', '1000.00', NOW);

      expect(result).toEqual({ allowed: true });
    });

    it('rejects when monthly spent + amount would be ₱500,000.01', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('0.00')
        .mockResolvedValueOnce('499999.99');

      const result = await service.checkLimits('uid', '0.02', NOW);

      expect(result).toMatchObject({
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        remaining: '0.01',
      });
    });

    it('allows a transaction that brings daily total to exactly ₱50,000', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('49999.01') // daily
        .mockResolvedValueOnce('0.00');    // monthly

      const result = await service.checkLimits('uid', '0.99', NOW);

      expect(result).toEqual({ allowed: true });
    });

    it('rejects when daily spent + amount would be ₱50,000.01', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('49999.99')
        .mockResolvedValueOnce('0.00');

      const result = await service.checkLimits('uid', '0.02', NOW);

      expect(result).toMatchObject({
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        remaining: '0.01',
      });
    });
  });

  // ─── Task 6.2: checkLimits ─────────────────────────────────────────────────

  describe('checkLimits', () => {
    it('returns allowed:true when well within both limits', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('1000.00');

      const result = await service.checkLimits('uid', '500.00', NOW);

      expect(result).toEqual({ allowed: true });
    });

    it('allows a transaction that brings daily total to exactly the limit', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('49000.00');

      const result = await service.checkLimits('uid', '1000.00', NOW);

      expect(result).toEqual({ allowed: true });
    });

    it('rejects when daily spent + amount exceeds DAILY_LIMIT', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('49999.99') // daily
        .mockResolvedValueOnce('0.00');    // monthly (checked only if daily passes)

      const result = await service.checkLimits('uid', '0.02', NOW);

      expect(result).toMatchObject({
        allowed: false,
        reason: 'DAILY_LIMIT_EXCEEDED',
        limit: DAILY_LIMIT,
      });
    });

    it('includes correct remaining when daily limit is breached', async () => {
      // spent = 49999.99, amount = 0.02 → over limit; remaining = 50000 - 49999.99 = 0.01
      mockRepo.sumByPeriod.mockResolvedValueOnce('49999.99').mockResolvedValueOnce('0.00');

      const result = await service.checkLimits('uid', '0.02', NOW);

      expect(result).toMatchObject({ allowed: false, remaining: '0.01' });
    });

    it('rejects when monthly spent + amount exceeds MONTHLY_LIMIT (daily ok)', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('1000.00')      // daily — within limit
        .mockResolvedValueOnce('499999.99');   // monthly — would be breached

      const result = await service.checkLimits('uid', '0.02', NOW);

      expect(result).toMatchObject({
        allowed: false,
        reason: 'MONTHLY_LIMIT_EXCEEDED',
        limit: MONTHLY_LIMIT,
        remaining: '0.01',
      });
    });

    it('reports DAILY_LIMIT_EXCEEDED when both daily and monthly would be breached', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('50000.00')   // daily already at/over limit
        .mockResolvedValueOnce('500000.00'); // monthly also over

      const result = await service.checkLimits('uid', '1.00', NOW);

      expect(result).toMatchObject({ allowed: false, reason: 'DAILY_LIMIT_EXCEEDED' });
    });

    it('forwards the tx client to both sumByPeriod calls', async () => {
      const tx = {} as never;
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.checkLimits('uid', '100.00', NOW, tx);

      expect(mockRepo.sumByPeriod).toHaveBeenCalledTimes(2);
      expect(mockRepo.sumByPeriod.mock.calls[0][2]).toBe(tx);
      expect(mockRepo.sumByPeriod.mock.calls[1][2]).toBe(tx);
    });

    it('clamps remaining to "0.00" when spent already exceeds the limit', async () => {
      mockRepo.sumByPeriod.mockResolvedValueOnce('55000.00').mockResolvedValueOnce('0.00');

      const result = await service.checkLimits('uid', '1.00', NOW);

      expect(result).toMatchObject({ allowed: false, remaining: '0.00' });
    });
  });

  // ─── Task 6.2: getLimitUsage ───────────────────────────────────────────────

  describe('getLimitUsage', () => {
    it('returns full LimitUsage structure with userId, asOf, and timezone', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      const result = await service.getLimitUsage('uid', NOW);

      expect(result.userId).toBe('uid');
      expect(result.asOf).toBe(NOW);
      expect(result.timezone).toBe('Asia/Manila');
    });

    it('returns correct spent and remaining for each period', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('12500.00')  // daily
        .mockResolvedValueOnce('37500.00'); // monthly

      const result = await service.getLimitUsage('uid', NOW);

      expect(result.daily.spent).toBe('12500.00');
      expect(result.daily.remaining).toBe('37500.00');
      expect(result.daily.limit).toBe(DAILY_LIMIT);

      expect(result.monthly.spent).toBe('37500.00');
      expect(result.monthly.remaining).toBe('462500.00');
      expect(result.monthly.limit).toBe(MONTHLY_LIMIT);
    });

    it('clamps remaining to "0.00" when spent exceeds limit', async () => {
      mockRepo.sumByPeriod
        .mockResolvedValueOnce('55000.00')  // daily overspent
        .mockResolvedValueOnce('600000.00'); // monthly overspent

      const result = await service.getLimitUsage('uid', NOW);

      expect(result.daily.remaining).toBe('0.00');
      expect(result.monthly.remaining).toBe('0.00');
    });

    it('does not forward a tx client to sumByPeriod', async () => {
      mockRepo.sumByPeriod.mockResolvedValue('0.00');

      await service.getLimitUsage('uid', NOW);

      expect(mockRepo.sumByPeriod.mock.calls[0][2]).toBeUndefined();
      expect(mockRepo.sumByPeriod.mock.calls[1][2]).toBeUndefined();
    });
  });
});
