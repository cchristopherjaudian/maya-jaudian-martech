import { z } from 'zod';
import { Prisma } from '@prisma/client';

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
// E.164: a leading '+', a non-zero first digit, then up to 14 more digits (max 15 digits total).
const E164_REGEX = /^\+[1-9]\d{1,14}$/;

export const amountSchema = z
  .string()
  .min(1, 'Amount is required')
  .regex(AMOUNT_REGEX, 'Amount must be a positive decimal with at most 2 decimal places')
  .refine(
    (v) => {
      try {
        return new Prisma.Decimal(v).gt(0);
      } catch {
        return false;
      }
    },
    { message: 'Amount must be greater than zero' },
  )
  .describe(
    'Positive PHP amount passed as a decimal string (e.g. "1500.00"), not a number. ' +
    'Strings are required because JSON numbers use IEEE 754 floating point, which cannot represent ' +
    'values like 1500.10 exactly — tiny errors accumulate and can cause incorrect limit checks. ' +
    'The server stores and computes amounts using exact decimal arithmetic (NUMERIC(15,2) in PostgreSQL, ' +
    'Prisma.Decimal in application code). Sending a number would lose precision before the value even reaches the API. ' +
    'This is the same approach used by Stripe for monetary amounts.',
  );

export const mobileNumberSchema = z
  .string()
  .min(1, 'Mobile number is required')
  .regex(E164_REGEX, 'Mobile number must be in E.164 format (e.g. "+639171234567")')
  .describe('Mobile number in E.164 format: a leading "+", country code, and subscriber number, with no spaces or separators (e.g. "+639171234567").');
