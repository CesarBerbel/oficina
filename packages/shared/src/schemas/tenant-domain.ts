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

/** Prefixo do host TXT usado na verificação por DNS. */
export const TENANT_DOMAIN_VERIFY_PREFIX = '_oficina-verify';

export interface TenantDomainDto {
  id: string;
  domain: string;
  isPrimary: boolean;
  verified: boolean;
  verifiedAt: string | null;
  createdAt: string;
  /** Subdomínio de domínio-base próprio: verificação automática (dispensa TXT). */
  autoVerified: boolean;
  /** Registro DNS a publicar para comprovar posse (TXT). */
  verification: {
    name: string; // ex.: _oficina-verify.minhaoficina.com.br
    type: 'TXT';
    value: string; // token
  };
}

/** Diagnóstico ao vivo do DNS de um domínio (consulta real no momento). */
export interface TenantDomainDnsCheckDto {
  domain: string;
  verified: boolean;
  /** Registro TXT de posse. */
  txt: {
    name: string;
    expected: string;
    found: string[];
    ok: boolean;
  };
  /** Apontamento do domínio (A/AAAA/CNAME) para o servidor. */
  address: {
    name: string;
    records: string[];
    ok: boolean;
  };
}
