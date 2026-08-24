import type { LimitBreachReason } from './errors';

export type TransactionStatus = 'COMPLETED' | 'FAILED';
export type { LimitBreachReason };

export interface CreateUserDto {
  mobileNumber: string;
  firstName: string;
  lastName: string;
}

export interface User {
  id: string;
  mobileNumber: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTransactionData {
  senderId: string;
  recipientId: string;
  amount: string;
  currency: 'PHP';
  status: TransactionStatus;
}

export interface Transaction {
  id: string;
  senderId: string;
  recipientId: string;
  amount: string;
  currency: string;
  status: TransactionStatus;
  createdAt: Date;
}

export interface PeriodBoundary {
  start: Date;
  end: Date;
}

export interface PaginationOptions {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type LimitCheckResult =
  | { allowed: true }
  | { allowed: false; reason: LimitBreachReason; remaining: string; limit: number };

export interface PeriodUsage {
  limit: number;
  spent: string;
  remaining: string;
  resetsAt: Date;
}

export interface LimitUsage {
  userId: string;
  asOf: Date;
  timezone: 'Asia/Manila';
  daily: PeriodUsage;
  monthly: PeriodUsage;
}

export interface CreateTransactionDto {
  senderId: string;
  recipientId: string;
  amount: string;
}

export interface TransactionHistoryItem {
  id: string;
  counterpartId: string;
  direction: 'SENT' | 'RECEIVED';
  amount: string;
  currency: string;
  status: TransactionStatus;
  createdAt: Date;
}
