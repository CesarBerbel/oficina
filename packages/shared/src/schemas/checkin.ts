import { z } from 'zod';
import {
  ChecklistStatus,
  DamageSeverity,
  FuelLevel,
} from '../enums/checkin.js';
import { paginationQuerySchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/** Ponto de avaria marcado sobre o diagrama da carroceria. */
export const damageSchema = z.object({
  /** Coordenadas relativas (0..1) sobre o diagrama, para reposicionar o pino. */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  severity: z.nativeEnum(DamageSeverity),
  description: z.string().trim().min(1, 'Descreva a avaria').max(200),
});
export type DamagePoint = z.infer<typeof damageSchema>;

/** Item do checklist de inspeção. */
export const checklistItemSchema = z.object({
  item: z.string().trim().min(1).max(80),
  status: z.nativeEnum(ChecklistStatus),
  note: optionalString(200),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const createCheckinSchema = z.object({
  serviceOrderId: z.string().min(1, 'Selecione a OS'),
  vehicleId: z.string().min(1, 'Selecione o veículo'),
  km: z.coerce.number().int().min(0).max(9_999_999).optional(),
  fuelLevel: z.nativeEnum(FuelLevel).optional(),
  damages: z.array(damageSchema).max(50).default([]),
  checklist: z.array(checklistItemSchema).max(60).default([]),
  photos: z.array(z.string().url()).max(30).default([]),
  signatureUrl: z.string().url().optional(),
  signedBy: optionalString(120),
  notes: optionalString(2000),
});
export type CreateCheckinInput = z.infer<typeof createCheckinSchema>;

export const listCheckinsQuerySchema = paginationQuerySchema.extend({
  vehicleId: z.string().optional(),
  customerId: z.string().optional(),
  serviceOrderId: z.string().optional(),
});
export type ListCheckinsQuery = z.infer<typeof listCheckinsQuerySchema>;

export interface CheckinDto {
  id: string;
  vehicleId: string;
  vehiclePlate: string;
  vehicleLabel: string;
  customerId: string;
  customerName: string;
  serviceOrderId: string;
  serviceOrderNumber: number;
  km: number | null;
  fuelLevel: FuelLevel | null;
  damages: DamagePoint[];
  checklist: ChecklistItem[];
  photos: string[];
  signatureUrl: string | null;
  signedBy: string | null;
  notes: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
}
