import {
  canTransition,
  isOrderEditable,
  isTerminalStatus,
  SERVICE_ORDER_TRANSITIONS,
  type ServiceOrderStatus,
} from '@oficina/shared';
import {
  InvalidStateTransitionError,
  ServiceOrderDomainError,
} from './service-order.errors';

/**
 * Máquina de estados da OS — regras puras, sem banco nem HTTP.
 * É a autoridade sobre transições válidas e travas de edição.
 */
export const ServiceOrderStateMachine = {
  /** Transições válidas a partir de um status. */
  nextStatuses(from: ServiceOrderStatus): ServiceOrderStatus[] {
    return SERVICE_ORDER_TRANSITIONS[from] ?? [];
  },

  canTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
    return canTransition(from, to);
  },

  /** Garante uma transição válida ou lança erro de domínio. */
  assertTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): void {
    if (from === to) {
      throw new ServiceOrderDomainError('A OS já está neste status');
    }
    if (!canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  },

  isTerminal(status: ServiceOrderStatus): boolean {
    return isTerminalStatus(status);
  },

  /**
   * OS somente-leitura não pode ser editada: status terminal (ENTREGUE/CANCELADA)
   * ou orçamento aprovado (é preciso reabrir o orçamento para editar).
   */
  assertEditable(status: ServiceOrderStatus): void {
    if (isOrderEditable(status)) return;
    if (status === 'ORCAMENTO_APROVADO') {
      throw new ServiceOrderDomainError(
        'Orçamento aprovado: reabra o orçamento para editar a OS.',
      );
    }
    throw new ServiceOrderDomainError(
      'OS finalizada ou cancelada não pode ser alterada',
    );
  },
} as const;
