/** Status de um atendimento/lead recebido pela Recepção. */
export const LeadStatus = {
  NOVO: 'NOVO',
  EM_ATENDIMENTO: 'EM_ATENDIMENTO',
  CONTATO_REALIZADO: 'CONTATO_REALIZADO',
  RETORNAR_DEPOIS: 'RETORNAR_DEPOIS',
  AGENDADO: 'AGENDADO',
  CONFIRMADO: 'CONFIRMADO',
  CLIENTE_CHEGOU: 'CLIENTE_CHEGOU',
  CONVERTIDO: 'CONVERTIDO',
  NAO_COMPARECEU: 'NAO_COMPARECEU',
  CANCELADO: 'CANCELADO',
  PERDIDO: 'PERDIDO',
  DUPLICADO: 'DUPLICADO',
  INVALIDO: 'INVALIDO',
  DESCARTADO: 'DESCARTADO',
} as const;

export type LeadStatus = (typeof LeadStatus)[keyof typeof LeadStatus];

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NOVO: 'Novo',
  EM_ATENDIMENTO: 'Em atendimento',
  CONTATO_REALIZADO: 'Contato realizado',
  RETORNAR_DEPOIS: 'Retornar depois',
  AGENDADO: 'Agendado',
  CONFIRMADO: 'Confirmado',
  CLIENTE_CHEGOU: 'Cliente chegou',
  CONVERTIDO: 'Convertido em OS',
  NAO_COMPARECEU: 'Não compareceu',
  CANCELADO: 'Cancelado',
  PERDIDO: 'Perdido',
  DUPLICADO: 'Duplicado',
  INVALIDO: 'Inválido',
  DESCARTADO: 'Descartado',
};

export const LEAD_STATUSES = Object.values(LeadStatus) as LeadStatus[];

export const RECEPTION_ACTIVE_STATUSES: LeadStatus[] = [
  LeadStatus.NOVO,
  LeadStatus.EM_ATENDIMENTO,
  LeadStatus.CONTATO_REALIZADO,
  LeadStatus.RETORNAR_DEPOIS,
  LeadStatus.AGENDADO,
  LeadStatus.CONFIRMADO,
  LeadStatus.CLIENTE_CHEGOU,
];

export const RECEPTION_CLOSED_STATUSES: LeadStatus[] = [
  LeadStatus.CONVERTIDO,
  LeadStatus.NAO_COMPARECEU,
  LeadStatus.CANCELADO,
  LeadStatus.PERDIDO,
  LeadStatus.DUPLICADO,
  LeadStatus.INVALIDO,
  LeadStatus.DESCARTADO,
];

export const LeadContactChannel = {
  TELEFONE: 'TELEFONE',
  WHATSAPP: 'WHATSAPP',
  EMAIL: 'EMAIL',
  PRESENCIAL: 'PRESENCIAL',
} as const;

export type LeadContactChannel = (typeof LeadContactChannel)[keyof typeof LeadContactChannel];

export const LEAD_CONTACT_CHANNEL_LABELS: Record<LeadContactChannel, string> = {
  TELEFONE: 'Ligação',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  PRESENCIAL: 'Presencial',
};

export const LEAD_CONTACT_CHANNELS = Object.values(LeadContactChannel) as LeadContactChannel[];

export const LeadContactOutcome = {
  ATENDEU: 'ATENDEU',
  NAO_ATENDEU: 'NAO_ATENDEU',
  TELEFONE_INCORRETO: 'TELEFONE_INCORRETO',
  CHAMAR_WHATSAPP: 'CHAMAR_WHATSAPP',
  PEDIU_RETORNO: 'PEDIU_RETORNO',
  AGENDOU_VISITA: 'AGENDOU_VISITA',
  CONFIRMOU_AGENDAMENTO: 'CONFIRMOU_AGENDAMENTO',
  CLIENTE_CHEGOU: 'CLIENTE_CHEGOU',
  NAO_COMPARECEU: 'NAO_COMPARECEU',
  CANCELOU_AGENDAMENTO: 'CANCELOU_AGENDAMENTO',
  SEM_INTERESSE: 'SEM_INTERESSE',
  JA_RESOLVEU: 'JA_RESOLVEU',
  ORCAMENTO_ENVIADO: 'ORCAMENTO_ENVIADO',
  CONVERTIDO_OS: 'CONVERTIDO_OS',
} as const;

export type LeadContactOutcome = (typeof LeadContactOutcome)[keyof typeof LeadContactOutcome];

export const LEAD_CONTACT_OUTCOME_LABELS: Record<LeadContactOutcome, string> = {
  ATENDEU: 'Atendeu',
  NAO_ATENDEU: 'Não atendeu',
  TELEFONE_INCORRETO: 'Telefone incorreto',
  CHAMAR_WHATSAPP: 'Chamar no WhatsApp',
  PEDIU_RETORNO: 'Pediu retorno',
  AGENDOU_VISITA: 'Agendou visita',
  CONFIRMOU_AGENDAMENTO: 'Confirmou agendamento',
  CLIENTE_CHEGOU: 'Cliente chegou',
  NAO_COMPARECEU: 'Não compareceu',
  CANCELOU_AGENDAMENTO: 'Cancelou agendamento',
  SEM_INTERESSE: 'Não tem interesse',
  JA_RESOLVEU: 'Já resolveu',
  ORCAMENTO_ENVIADO: 'Orçamento enviado',
  CONVERTIDO_OS: 'Convertido em OS',
};

export const LEAD_CONTACT_OUTCOMES = Object.values(LeadContactOutcome) as LeadContactOutcome[];

export const LeadConflictLevel = {
  OK: 'OK',
  ATENCAO: 'ATENCAO',
  CONFLITO: 'CONFLITO',
  SEM_DADOS: 'SEM_DADOS',
} as const;

export type LeadConflictLevel = (typeof LeadConflictLevel)[keyof typeof LeadConflictLevel];

export const LEAD_CONFLICT_LEVEL_LABELS: Record<LeadConflictLevel, string> = {
  OK: 'Conferido',
  ATENCAO: 'Atenção',
  CONFLITO: 'Conflito',
  SEM_DADOS: 'Sem dados',
};

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
