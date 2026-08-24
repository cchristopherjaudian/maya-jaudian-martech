import { describe, it, expect } from 'vitest';
import {
  AppError,
  UserNotFoundError,
  DuplicateMobileNumberError,
  LimitExceededError,
  SelfTransferError,
  InvalidAmountError,
  DAILY_LIMIT,
  MONTHLY_LIMIT,
} from './index';

describe('AppError', () => {
  it('is an instance of Error', () => {
    const err = new UserNotFoundError('abc-123');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  it('sets name to the subclass constructor name', () => {
    expect(new UserNotFoundError('x').name).toBe('UserNotFoundError');
    expect(new DuplicateMobileNumberError('+63917').name).toBe('DuplicateMobileNumberError');
    expect(new SelfTransferError().name).toBe('SelfTransferError');
    expect(new InvalidAmountError().name).toBe('InvalidAmountError');
  });
});

describe('UserNotFoundError', () => {
  const err = new UserNotFoundError('user-id-42');

  it('carries the userId', () => {
    expect(err.userId).toBe('user-id-42');
  });

  it('has code USER_NOT_FOUND', () => {
    expect(err.code).toBe('USER_NOT_FOUND');
  });

  it('has statusCode 404', () => {
    expect(err.statusCode).toBe(404);
  });

  it('includes userId in the message', () => {
    expect(err.message).toContain('user-id-42');
  });
});

describe('DuplicateMobileNumberError', () => {
  const err = new DuplicateMobileNumberError('+639171234567');

  it('has code DUPLICATE_MOBILE_NUMBER', () => {
    expect(err.code).toBe('DUPLICATE_MOBILE_NUMBER');
  });

  it('has statusCode 409', () => {
    expect(err.statusCode).toBe(409);
  });
});

describe('LimitExceededError', () => {
  it('carries daily breach reason, limit, and remaining', () => {
    const err = new LimitExceededError('DAILY_LIMIT_EXCEEDED', 50_000, '2500.00');
    expect(err.reason).toBe('DAILY_LIMIT_EXCEEDED');
    expect(err.limit).toBe(50_000);
    expect(err.remaining).toBe('2500.00');
    expect(err.code).toBe('DAILY_LIMIT_EXCEEDED');
    expect(err.statusCode).toBe(422);
  });

  it('carries monthly breach reason, limit, and remaining', () => {
    const err = new LimitExceededError('MONTHLY_LIMIT_EXCEEDED', 500_000, '0.00');
    expect(err.reason).toBe('MONTHLY_LIMIT_EXCEEDED');
    expect(err.limit).toBe(500_000);
    expect(err.remaining).toBe('0.00');
    expect(err.code).toBe('MONTHLY_LIMIT_EXCEEDED');
    expect(err.statusCode).toBe(422);
  });
});

describe('SelfTransferError', () => {
  const err = new SelfTransferError();

  it('has code SELF_TRANSFER_NOT_ALLOWED', () => {
    expect(err.code).toBe('SELF_TRANSFER_NOT_ALLOWED');
  });

  it('has statusCode 422', () => {
    expect(err.statusCode).toBe(422);
  });
});

describe('InvalidAmountError', () => {
  it('has code INVALID_AMOUNT and statusCode 422', () => {
    const err = new InvalidAmountError();
    expect(err.code).toBe('INVALID_AMOUNT');
    expect(err.statusCode).toBe(422);
  });

  it('accepts a custom message', () => {
    const err = new InvalidAmountError('Amount must be positive');
    expect(err.message).toBe('Amount must be positive');
  });
});

describe('limit constants', () => {
  it('DAILY_LIMIT is 50000', () => {
    expect(DAILY_LIMIT).toBe(50_000);
  });

  it('MONTHLY_LIMIT is 500000', () => {
    expect(MONTHLY_LIMIT).toBe(500_000);
  });
});
