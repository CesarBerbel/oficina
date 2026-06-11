/** Status de um lead recebido pelo site. */
export const LeadStatus = {
  NOVO: 'NOVO',
  EM_ATENDIMENTO: 'EM_ATENDIMENTO',
  CONVERTIDO: 'CONVERTIDO',
  DESCARTADO: 'DESCARTADO',
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  EM_ATENDIMENTO: 'Em atendimento',
  CONVERTIDO: 'Convertido',
  DESCARTADO: 'Descartado',
};

export const LEAD_STATUSES = Object.values(LeadStatus) as LeadStatus[];

/** Status de publicação de artigos do blog. */
export const BlogStatus = {
  RASCUNHO: 'RASCUNHO',
  PUBLICADO: 'PUBLICADO',
} as const;

export type BlogStatus = (typeof BlogStatus)[keyof typeof BlogStatus];

export const BLOG_STATUS_LABELS: Record<BlogStatus, string> = {
  RASCUNHO: 'Rascunho',
  PUBLICADO: 'Publicado',
};
