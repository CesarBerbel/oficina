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
  ORCAMENTO: ['ORCAMENTO_APROVADO', 'CANCELADA'],
  ORCAMENTO_APROVADO: ['EM_EXECUCAO', 'CANCELADA'],
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

export function canTransition(
  from: ServiceOrderStatus,
  to: ServiceOrderStatus,
): boolean {
  return SERVICE_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminalStatus(status: ServiceOrderStatus): boolean {
  return SERVICE_ORDER_TERMINAL_STATUSES.includes(status);
}
