import { z } from 'zod';
import { FuelType, TransmissionType } from '../enums/vehicle.js';
import { paginationQuerySchema, placaSchema } from './common.js';

const optionalString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

const currentYear = new Date().getFullYear();

export const createVehicleSchema = z.object({
  customerId: z.string().min(1, 'Selecione o cliente'),
  plate: placaSchema,
  manufacturer: z.string().trim().min(1, 'Informe o fabricante').max(60),
  model: z.string().trim().min(1, 'Informe o modelo').max(80),
  modelYear: z.coerce
    .number()
    .int()
    .min(1900)
    .max(currentYear + 1)
    .optional(),
  color: optionalString(40),
  fuel: z.nativeEnum(FuelType).optional(),
  engine: optionalString(40),
  transmission: z.nativeEnum(TransmissionType).optional(),
  currentKm: z.coerce.number().int().min(0).max(9_999_999).optional(),
  notes: optionalString(2000),
});

export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial();
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const listVehiclesQuerySchema = paginationQuerySchema.extend({
  customerId: z.string().optional(),
  fuel: z.nativeEnum(FuelType).optional(),
});
export type ListVehiclesQuery = z.infer<typeof listVehiclesQuerySchema>;

export interface VehicleDto {
  id: string;
  customerId: string;
  customerName: string;
  plate: string;
  manufacturer: string;
  model: string;
  modelYear: number | null;
  color: string | null;
  fuel: FuelType | null;
  engine: string | null;
  transmission: TransmissionType | null;
  currentKm: number | null;
  notes: string | null;
  createdAt: string;
}
