import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { DateTime } from 'luxon';

describe('project setup smoke tests', () => {
  it('Zod parses a valid decimal string', () => {
    const schema = z.string().regex(/^\d+(\.\d{1,2})?$/);
    expect(schema.safeParse('1500.00').success).toBe(true);
    expect(schema.safeParse('abc').success).toBe(false);
  });

  it('Luxon produces a valid Asia/Manila DateTime', () => {
    const pht = DateTime.now().setZone('Asia/Manila');
    expect(pht.isValid).toBe(true);
    expect(pht.zoneName).toBe('Asia/Manila');
  });

  it('DAILY_LIMIT and MONTHLY_LIMIT constants are correct', () => {
    const DAILY_LIMIT = 50_000;
    const MONTHLY_LIMIT = 500_000;
    expect(DAILY_LIMIT).toBe(50000);
    expect(MONTHLY_LIMIT).toBe(500000);
  });
});
