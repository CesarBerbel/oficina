import { z } from 'zod';
import { CategoryKind } from '../enums/category.js';

export const createCategorySchema = z.object({
  kind: z.nativeEnum(CategoryKind),
  name: z.string().trim().min(1, 'Informe o nome').max(60),
  active: z.boolean().default(true),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1, 'Informe o nome').max(60).optional(),
  active: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const listCategoriesQuerySchema = z.object({
  kind: z.nativeEnum(CategoryKind).optional(),
});
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

export interface CategoryDto {
  id: string;
  kind: CategoryKind;
  name: string;
  active: boolean;
}
