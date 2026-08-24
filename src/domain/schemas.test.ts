import { describe, it, expect } from 'vitest';
import { amountSchema, mobileNumberSchema } from './schemas';

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

describe('mobileNumberSchema', () => {
  describe('valid E.164 mobile numbers', () => {
    const valid = ['+639171234567', '+639991234567', '+14155552671', '+442071838750'];

    valid.forEach((v) => {
      it(`accepts "${v}"`, () => {
        expect(mobileNumberSchema.safeParse(v).success).toBe(true);
      });
    });
  });

  describe('invalid mobile numbers', () => {
    const cases: [string, string][] = [
      ['', 'empty string'],
      ['09171234567', 'missing leading +'],
      ['+0171234567', 'leading zero after country code'],
      ['+63 917 123 4567', 'contains spaces'],
      ['+63-917-123-4567', 'contains dashes'],
      ['+639171234567abc', 'trailing non-digit characters'],
      ['abcdefghijk', 'non-numeric string'],
      ['+1', 'too short to be a real number'],
      ['+1234567890123456', 'more than 15 digits'],
    ];

    cases.forEach(([v, reason]) => {
      it(`rejects "${v}" (${reason})`, () => {
        expect(mobileNumberSchema.safeParse(v).success).toBe(false);
      });
    });
  });
});
