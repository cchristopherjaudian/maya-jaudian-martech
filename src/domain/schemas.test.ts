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
  describe('valid PH mobile numbers (+63 followed by exactly 10 digits, not starting with 0)', () => {
    const valid = ['+639171234567', '+639991234567', '+631234567890'];

    valid.forEach((v) => {
      it(`accepts "${v}"`, () => {
        expect(mobileNumberSchema.safeParse(v).success).toBe(true);
      });
    });
  });

  describe('invalid mobile numbers', () => {
    const cases: [string, string][] = [
      ['', 'empty string'],
      ['09171234567', 'missing leading +63'],
      ['9171234567', 'missing + and country code entirely'],
      ['+14155552671', 'non-PH country code'],
      ['+63 917 123 4567', 'contains spaces'],
      ['+63-917-123-4567', 'contains dashes'],
      ['+63917123456', 'only 9 digits after +63'],
      ['+6391712345678', '11 digits after +63'],
      ['+630907389171', 'starts with 0 after +63'],
      ['+639171234567abc', 'trailing non-digit characters'],
      ['abcdefghijk', 'non-numeric string'],
      ['+63', 'country code with no subscriber number'],
    ];

    cases.forEach(([v, reason]) => {
      it(`rejects "${v}" (${reason})`, () => {
        expect(mobileNumberSchema.safeParse(v).success).toBe(false);
      });
    });
  });
});
