import { z } from 'zod';

/** Atualização administrativa de uma oficina (gestão de plataforma). */
export const updatePlatformTenantSchema = z.object({
  active: z.boolean(),
});
export type UpdatePlatformTenantInput = z.infer<typeof updatePlatformTenantSchema>;

/** Oficina (tenant) na visão do administrador da plataforma. */
export interface PlatformTenantDto {
  id: string;
  name: string;
  slug: string;
  cnpj: string | null;
  active: boolean;
  usersCount: number;
  serviceOrdersCount: number;
  createdAt: string;
}
