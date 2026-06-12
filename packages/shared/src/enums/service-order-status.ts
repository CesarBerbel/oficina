/**
 * Status da Ordem de Serviço (OS) e a máquina de estados.
 * A validação autoritativa vive no domínio do backend
 * (apps/api/.../service-order.state-machine.ts); este mapa é compartilhado
 * para que o frontend saiba quais transições oferecer.
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

export type ServiceOrderStatus =
  (typeof ServiceOrderStatus)[keyof typeof ServiceOrderStatus];

export const SERVICE_ORDER_STATUSES = Object.values(
  ServiceOrderStatus,
) as ServiceOrderStatus[];

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

/** Transições válidas a partir de cada status. */
export const SERVICE_ORDER_TRANSITIONS: Record<
  ServiceOrderStatus,
  ServiceOrderStatus[]
> = {
  ENTRADA: ['DIAGNOSTICO_PRONTO', 'CANCELADA'],
  DIAGNOSTICO_PRONTO: ['ORCAMENTO', 'CANCELADA'],
  // Aprovação leva a "aprovado" (tudo em estoque) ou "aguardando peça" (falta
  // estoque → pedido de compra gerado).
  ORCAMENTO: ['ORCAMENTO_APROVADO', 'AGUARDANDO_PECA', 'ORCAMENTO_RECUSADO', 'CANCELADA'],
  // Aprovado: avança para execução, ou reabre o orçamento (volta a editar a OS
  // e gerar um novo orçamento), ou cancela.
  ORCAMENTO_APROVADO: ['EM_EXECUCAO', 'DIAGNOSTICO_PRONTO', 'CANCELADA'],
  // Recusado pode gerar um novo orçamento (volta para ORCAMENTO) ou cancelar.
  ORCAMENTO_RECUSADO: ['ORCAMENTO', 'CANCELADA'],
  // Aguardando peça: ao receber a compra avança para aprovado; permite executar
  // manualmente (peça obtida de outra forma), reabrir o orçamento ou cancelar.
  AGUARDANDO_PECA: [
    'ORCAMENTO_APROVADO',
    'EM_EXECUCAO',
    'DIAGNOSTICO_PRONTO',
    'CANCELADA',
  ],
  EM_EXECUCAO: ['EM_TESTE', 'CANCELADA'],
  EM_TESTE: ['PRONTA', 'EM_EXECUCAO'],
  PRONTA: ['PRONTO_RETIRAR'],
  PRONTO_RETIRAR: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADA: [],
};

/** Status terminais: OS não pode mais ser editada. */
export const SERVICE_ORDER_TERMINAL_STATUSES: ServiceOrderStatus[] = [
  'ENTREGUE',
  'CANCELADA',
];

/**
 * Status em que a OS fica somente-leitura (não permite editar itens/diagnóstico):
 * os terminais e o orçamento aprovado pelo cliente. Para voltar a editar uma OS
 * com orçamento aprovado, é preciso reabrir o orçamento.
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

export function canTransition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): boolean {
  return SERVICE_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_TERMINAL_STATUSES.includes(status);
}
