import { z } from 'zod';
import { paginationQuerySchema } from './common.js';
import {
  FinancialEntryStatus,
  FinancialEntryType,
  FinancialPaymentMethod,
} from '../enums/financial.js';

const money = z.coerce.number().finite().positive('Informe um valor maior que zero').max(999999999);
const opt = (max: number) => z.string().trim().max(max).optional().transform((v) => (v === '' ? undefined : v));

export const listFinancialEntriesQuerySchema = paginationQuerySchema.extend({
  type: z.nativeEnum(FinancialEntryType).optional(),
  status: z.nativeEnum(FinancialEntryStatus).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type ListFinancialEntriesQuery = z.infer<typeof listFinancialEntriesQuerySchema>;

export const createFinancialEntrySchema = z.object({
  type: z.nativeEnum(FinancialEntryType),
  description: z.string().trim().min(2, 'Informe a descrição').max(180),
  category: opt(80),
  customerId: opt(80),
  supplierId: opt(80),
  dueDate: z.string().datetime('Informe uma data válida'),
  amount: money,
  notes: opt(1000),
});
export type CreateFinancialEntryInput = z.infer<typeof createFinancialEntrySchema>;

export const payFinancialEntrySchema = z.object({
  amount: money,
  method: z.nativeEnum(FinancialPaymentMethod),
  paidAt: z.string().datetime('Informe uma data válida').optional(),
  notes: opt(1000),
});
export type PayFinancialEntryInput = z.infer<typeof payFinancialEntrySchema>;

export const syncServiceOrderFinancialSchema = z.object({
  serviceOrderId: z.string().trim().min(1),
  dueDate: z.string().datetime().optional(),
});
export type SyncServiceOrderFinancialInput = z.infer<typeof syncServiceOrderFinancialSchema>;

export const syncPurchaseFinancialSchema = z.object({
  purchaseOrderId: z.string().trim().min(1),
  dueDate: z.string().datetime().optional(),
});
export type SyncPurchaseFinancialInput = z.infer<typeof syncPurchaseFinancialSchema>;

export interface FinancialPaymentDto {
  id: string;
  amount: number;
  method: FinancialPaymentMethod;
  paidAt: string;
  notes: string | null;
}

export interface FinancialEntryDto {
  id: string;
  type: FinancialEntryType;
  status: FinancialEntryStatus;
  origin: string;
  description: string;
  category: string | null;
  customerId: string | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  serviceOrderId: string | null;
  serviceOrderNumber: number | null;
  purchaseOrderId: string | null;
  purchaseOrderNumber: number | null;
  issueDate: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  overdue: boolean;
  notes: string | null;
  payments: FinancialPaymentDto[];
  createdAt: string;
}

export interface FinancialSummaryDto {
  receivableOpen: number;
  payableOpen: number;
  overdueReceivable: number;
  overduePayable: number;
  receivedInPeriod: number;
  paidInPeriod: number;
  netCashFlow: number;
  projectedBalance: number;
  openReceivablesCount: number;
  openPayablesCount: number;
}
