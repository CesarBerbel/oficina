/**
 * Status da Ordem de Serviço (OS) e a máquina de estados compartilhada.
 *
 * O backend continua sendo a autoridade final de validação, mas este arquivo
 * concentra a matriz de estados, labels e metadados necessários para o
 * frontend exibir ações coerentes sem duplicar regra de negócio.
 */
export const ServiceOrderStatus = {
  ENTRADA: 'ENTRADA',
  DIAGNOSTICO_PRONTO: 'DIAGNOSTICO_PRONTO',
  ORCAMENTO: 'ORCAMENTO',
  ORCAMENTO_APROVADO: 'ORCAMENTO_APROVADO',
  ORCAMENTO_RECUSADO: 'ORCAMENTO_RECUSADO',
  AGUARDANDO_PECA: 'AGUARDANDO_PECA',
  EM_EXECUCAO: 'EM_EXECUCAO',
  EM_TESTE: 'EM_TESTE',
  PRONTA: 'PRONTA',
  PRONTO_RETIRAR: 'PRONTO_RETIRAR',
  ENTREGUE: 'ENTREGUE',
  CANCELADA: 'CANCELADA',
} as const;

export type ServiceOrderStatus = (typeof ServiceOrderStatus)[keyof typeof ServiceOrderStatus];

export const SERVICE_ORDER_STATUSES = Object.values(ServiceOrderStatus) as ServiceOrderStatus[];

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  ENTRADA: 'Entrada',
  DIAGNOSTICO_PRONTO: 'Diagnóstico pronto',
  ORCAMENTO: 'Orçamento',
  ORCAMENTO_APROVADO: 'Orçamento aprovado',
  ORCAMENTO_RECUSADO: 'Orçamento recusado',
  AGUARDANDO_PECA: 'Aguardando peça',
  EM_EXECUCAO: 'Em execução',
  EM_TESTE: 'Em teste',
  PRONTA: 'Pronta',
  PRONTO_RETIRAR: 'Pronto para retirar',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
};

/** Ordem principal exibida em timeline/kanban. */
export const SERVICE_ORDER_STATUS_FLOW: ServiceOrderStatus[] = [
  'ENTRADA',
  'DIAGNOSTICO_PRONTO',
  'ORCAMENTO',
  'ORCAMENTO_APROVADO',
  'AGUARDANDO_PECA',
  'EM_EXECUCAO',
  'EM_TESTE',
  'PRONTA',
  'PRONTO_RETIRAR',
  'ENTREGUE',
];

/** Transições válidas de domínio, incluindo transições sistêmicas. */
export const SERVICE_ORDER_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  ENTRADA: ['DIAGNOSTICO_PRONTO', 'CANCELADA'],
  DIAGNOSTICO_PRONTO: ['ORCAMENTO', 'CANCELADA'],
  // A geração do orçamento entra em ORCAMENTO. A aprovação pode terminar em
  // ORCAMENTO_APROVADO ou AGUARDANDO_PECA, conforme estoque/reserva.
  ORCAMENTO: ['ORCAMENTO_APROVADO', 'AGUARDANDO_PECA', 'ORCAMENTO_RECUSADO', 'CANCELADA'],
  // Reabertura para edição é tratada pelo fluxo de orçamento.
  ORCAMENTO_APROVADO: ['EM_EXECUCAO', 'DIAGNOSTICO_PRONTO', 'CANCELADA'],
  ORCAMENTO_RECUSADO: ['ORCAMENTO', 'CANCELADA'],
  AGUARDANDO_PECA: ['ORCAMENTO_APROVADO', 'EM_EXECUCAO', 'DIAGNOSTICO_PRONTO', 'CANCELADA'],
  EM_EXECUCAO: ['EM_TESTE', 'CANCELADA'],
  EM_TESTE: ['PRONTA', 'EM_EXECUCAO'],
  PRONTA: ['PRONTO_RETIRAR'],
  PRONTO_RETIRAR: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADA: [],
};

export type ServiceOrderTransitionSource = 'MANUAL' | 'QUOTE' | 'PURCHASE' | 'SYSTEM';

export interface ServiceOrderTransitionDefinition {
  /** Status de destino. */
  status: ServiceOrderStatus;
  /** Texto curto para botão/ação. */
  label: string;
  /** Descrição da regra para tooltip/ajuda. */
  description: string;
  /** Origem operacional da transição. */
  source: ServiceOrderTransitionSource;
  /** Ação negativa/destrutiva visualmente. */
  destructive: boolean;
  /** Exige confirmação explícita no frontend. */
  requiresConfirmation: boolean;
  /** Exige diagnóstico técnico persistido. */
  requiresDiagnosis: boolean;
  /** Exige orçamento gerado/enviado. */
  requiresQuote: boolean;
}

export interface ServiceOrderTransitionDto extends ServiceOrderTransitionDefinition {
  /** Quando preenchido, a ação deve ser exibida como bloqueada. */
  disabledReason: string | null;
}

const transition = (
  definition: ServiceOrderTransitionDefinition,
): ServiceOrderTransitionDefinition => definition;

/**
 * Ações manuais disponíveis no endpoint de status da OS.
 *
 * Algumas transições de domínio são sistêmicas e não aparecem aqui:
 * - DIAGNOSTICO_PRONTO -> ORCAMENTO: geração/regeração de orçamento;
 * - ORCAMENTO -> AGUARDANDO_PECA: efeito automático da aprovação com falta;
 * - ORCAMENTO_APROVADO/AGUARDANDO_PECA -> DIAGNOSTICO_PRONTO: reabertura;
 * - AGUARDANDO_PECA -> ORCAMENTO_APROVADO: recebimento de compra pode avançar.
 */
export const SERVICE_ORDER_MANUAL_TRANSITIONS: Record<
  ServiceOrderStatus,
  ServiceOrderTransitionDefinition[]
> = {
  ENTRADA: [
    transition({
      status: 'DIAGNOSTICO_PRONTO',
      label: 'Concluir diagnóstico',
      description: 'Exige diagnóstico técnico salvo na OS.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: true,
      requiresQuote: false,
    }),
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS e bloqueia novas edições.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  DIAGNOSTICO_PRONTO: [
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS antes do orçamento.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  ORCAMENTO: [
    transition({
      status: 'ORCAMENTO_APROVADO',
      label: 'Aprovar orçamento',
      description: 'Registra aprovação manual/offline e reserva as peças aprovadas.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: true,
    }),
    transition({
      status: 'ORCAMENTO_RECUSADO',
      label: 'Recusar orçamento',
      description: 'Registra recusa manual/offline do orçamento.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: true,
    }),
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS em orçamento.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  ORCAMENTO_APROVADO: [
    transition({
      status: 'EM_EXECUCAO',
      label: 'Iniciar execução',
      description: 'Baixa as peças reservadas e inicia o serviço.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS e libera reservas/compras abertas.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  ORCAMENTO_RECUSADO: [
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Encerra a OS recusada.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  AGUARDANDO_PECA: [
    transition({
      status: 'ORCAMENTO_APROVADO',
      label: 'Marcar peças disponíveis',
      description: 'Usa quando as peças foram obtidas por outro caminho e a OS pode seguir.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
    transition({
      status: 'EM_EXECUCAO',
      label: 'Iniciar execução',
      description: 'Inicia execução com as peças disponíveis.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS e libera reservas/compras abertas.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  EM_EXECUCAO: [
    transition({
      status: 'EM_TESTE',
      label: 'Enviar para teste',
      description: 'Marca o serviço como pronto para conferência/teste.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
    transition({
      status: 'CANCELADA',
      label: 'Cancelar OS',
      description: 'Cancela a OS em execução.',
      source: 'MANUAL',
      destructive: true,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  EM_TESTE: [
    transition({
      status: 'PRONTA',
      label: 'Finalizar serviço',
      description: 'Marca a OS como pronta após teste.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
    transition({
      status: 'EM_EXECUCAO',
      label: 'Voltar para execução',
      description: 'Retorna para retrabalho após reprovação no teste.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  PRONTA: [
    transition({
      status: 'PRONTO_RETIRAR',
      label: 'Avisar retirada',
      description: 'Marca que o cliente já pode retirar o veículo.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: false,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  PRONTO_RETIRAR: [
    transition({
      status: 'ENTREGUE',
      label: 'Entregar veículo',
      description: 'Encerra a OS com o veículo entregue ao cliente.',
      source: 'MANUAL',
      destructive: false,
      requiresConfirmation: true,
      requiresDiagnosis: false,
      requiresQuote: false,
    }),
  ],
  ENTREGUE: [],
  CANCELADA: [],
};

/** Status terminais: OS não pode mais ser editada. */
export const SERVICE_ORDER_TERMINAL_STATUSES: ServiceOrderStatus[] = ['ENTREGUE', 'CANCELADA'];

/**
 * Status em que a OS fica somente-leitura (não permite editar itens/diagnóstico).
 * Para voltar a editar uma OS aprovada/aguardando peça, é preciso reabrir o
 * orçamento pelo fluxo de orçamento.
 */
export const SERVICE_ORDER_LOCKED_STATUSES: ServiceOrderStatus[] = [
  ...SERVICE_ORDER_TERMINAL_STATUSES,
  'ORCAMENTO_APROVADO',
  'AGUARDANDO_PECA',
];

/** A OS pode ter itens/diagnóstico editados neste status? */
export function isOrderEditable(status: ServiceOrderStatus): boolean {
  return !SERVICE_ORDER_LOCKED_STATUSES.includes(status);
}

export function canTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canManualTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_MANUAL_TRANSITIONS[from]?.some((item) => item.status === to) ?? false;
}

export function getManualTransitionDefinition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): ServiceOrderTransitionDefinition | null {
  return SERVICE_ORDER_MANUAL_TRANSITIONS[from]?.find((item) => item.status === to) ?? null;
}

export function isTerminalStatus(status: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_TERMINAL_STATUSES.includes(status);
}
