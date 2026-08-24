import { describe, it, expect } from 'vitest';
import { amountSchema } from './schemas';

describe('amountSchema', () => {
  describe('valid amounts', () => {
    const valid = ['1', '0.99', '1500.10', '50000.00', '500000', '0.01', '100'];

    valid.forEach((v) => {
      it(`accepts "${v}"`, () => {
        expect(amountSchema.safeParse(v).success).toBe(true);
      });
    });
  });

  describe('invalid amounts', () => {
    const cases: [string, string][] = [
      ['0', 'zero is not a positive amount'],
      ['0.00', 'zero with decimals is not positive'],
      ['-1.00', 'negative amount'],
      ['1500.001', 'more than 2 decimal places'],
      ['1.999', 'more than 2 decimal places'],
      ['abc', 'non-numeric string'],
      ['', 'empty string'],
      ['1,500', 'comma-formatted number'],
      ['1500.1.0', 'malformed decimal'],
    ];

    cases.forEach(([v, reason]) => {
      it(`rejects "${v}" (${reason})`, () => {
        expect(amountSchema.safeParse(v).success).toBe(false);
      });
    });
  });
});
