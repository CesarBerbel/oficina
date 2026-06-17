import { z } from 'zod';

/** Atualização administrativa de uma oficina (gestão de plataforma). */
export const updatePlatformTenantSchema = z.object({
  active: z.boolean(),
});
export type UpdatePlatformTenantInput = z.infer<typeof updatePlatformTenantSchema>;

/** Criação de uma filial (pelo super usuário). A filial fica sob a matriz. */
export const createBranchSchema = z.object({
  shopName: z.string().trim().min(2, 'Informe o nome da filial').max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'Informe o identificador da filial')
    .max(80, 'Identificador muito longo')
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      'Use apenas letras minúsculas, números e hífens',
    ),
  cnpj: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  adminName: z.string().trim().min(2, 'Informe o nome do administrador').max(120),
  adminEmail: z.string().trim().toLowerCase().email('E-mail inválido'),
  password: z
    .string()
    .min(8, 'Mínimo de 8 caracteres')
    .max(72, 'Máximo de 72 caracteres'),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;

/** Oficina (tenant) na visão do administrador da plataforma. */
export interface PlatformTenantDto {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  active: boolean;
  /** null = matriz; preenchido = filial (id da matriz). */
  parentId: string | null;
  isMatriz: boolean;
  usersCount: number;
  serviceOrdersCount: number;
  createdAt: string;
}
