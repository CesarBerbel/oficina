import { z } from 'zod';

/** Domínio próprio de uma oficina (host → tenant na resolução do site público). */
const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const createTenantDomainSchema = z.object({
  domain: z
    .string()
    .trim()
    .toLowerCase()
    .min(3)
    .max(253)
    .transform((v) =>
      v
        .replace(/^https?:\/\//, '')
        .replace(/\/.*$/, '')
        .replace(/^www\./, ''),
    )
    .refine((v) => domainRegex.test(v), 'Domínio inválido (ex.: oficina.com.br)'),
});
export type CreateTenantDomainInput = z.infer<typeof createTenantDomainSchema>;

export interface TenantDomainDto {
  id: string;
  domain: string;
  isPrimary: boolean;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
}
