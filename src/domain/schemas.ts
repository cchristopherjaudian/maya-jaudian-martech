import { z } from 'zod';
import { Prisma } from '@prisma/client';

const AMOUNT_REGEX = /^\d+(\.\d{1,2})?$/;
// PH mobile number: '+63' country code, then exactly 10 subscriber digits not starting with 0.
const PH_MOBILE_REGEX = /^\+63[1-9]\d{9}$/;

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
  .regex(
    PH_MOBILE_REGEX,
    'Mobile number must be a PH number in the format "+63" followed by exactly 10 digits, not starting with 0 (e.g. "+639171234567")',
  )
  .describe('Philippine mobile number: "+63" followed by exactly 10 subscriber digits not starting with 0, no spaces or separators (e.g. "+639171234567").');
