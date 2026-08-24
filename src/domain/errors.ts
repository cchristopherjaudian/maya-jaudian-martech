export type LimitBreachReason = 'DAILY_LIMIT_EXCEEDED' | 'MONTHLY_LIMIT_EXCEEDED';

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UserNotFoundError extends AppError {
  constructor(public readonly userId: string) {
    super(`User not found: ${userId}`, 'USER_NOT_FOUND', 404);
  }
}

export class DuplicateMobileNumberError extends AppError {
  constructor(mobileNumber: string) {
    super(`Mobile number already registered: ${mobileNumber}`, 'DUPLICATE_MOBILE_NUMBER', 409);
  }
}

export class LimitExceededError extends AppError {
  constructor(
    public readonly reason: LimitBreachReason,
    public readonly limit: number,
    public readonly remaining: string,
  ) {
    super(
      `Transaction would exceed ${reason === 'DAILY_LIMIT_EXCEEDED' ? 'daily' : 'monthly'} limit`,
      reason,
      422,
    );
  }
}

export class SelfTransferError extends AppError {
  constructor() {
    super('Sender and recipient must be different users', 'SELF_TRANSFER_NOT_ALLOWED', 422);
  }
}

export class InvalidAmountError extends AppError {
  constructor(message = 'Invalid amount') {
    super(message, 'INVALID_AMOUNT', 422);
  }
}
