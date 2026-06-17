import {
  canTransition,
  getManualTransitionDefinition,
  isOrderEditable,
  isTerminalStatus,
  SERVICE_ORDER_MANUAL_TRANSITIONS,
  SERVICE_ORDER_TRANSITIONS,
  type ServiceOrderStatus,
  type ServiceOrderTransitionDto,
} from '@oficina/shared';
import { InvalidStateTransitionError, ServiceOrderDomainError } from './service-order.errors';

export interface ServiceOrderTransitionContext {
  status: ServiceOrderStatus;
  diagnosis: string | null;
  itemCount: number;
  quoteStatus: 'RASCUNHO' | 'ENVIADO' | 'APROVADO' | 'APROVADO_PARCIAL' | 'RECUSADO' | null;
}

/**
 * Máquina de estados da OS — regras puras, sem banco nem HTTP.
 *
 * A matriz compartilhada define as transições de domínio. Esta camada aplica
 * as regras operacionais do endpoint manual de status e calcula as ações que o
 * frontend deve exibir, sempre com a mesma validação que o backend usa.
 */
export const ServiceOrderStateMachine = {
  /** Transições válidas de domínio a partir de um status. */
  nextStatuses(from: ServiceOrderStatus): ServiceOrderStatus[] {
    return SERVICE_ORDER_TRANSITIONS[from] ?? [];
  },

  /** Ações manuais expostas no endpoint /service-orders/:id/status. */
  manualTransitions(from: ServiceOrderStatus): ServiceOrderTransitionDto[] {
    return (SERVICE_ORDER_MANUAL_TRANSITIONS[from] ?? []).map((definition) => ({
      ...definition,
      disabledReason: null,
    }));
  },

  canTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): boolean {
    return canTransition(from, to);
  },

  /** Garante uma transição de domínio válida ou lança erro de domínio. */
  assertTransition(from: ServiceOrderStatus, to: ServiceOrderStatus): void {
    if (from === to) {
      throw new ServiceOrderDomainError('A OS já está neste status');
    }
    if (!canTransition(from, to)) {
      throw new InvalidStateTransitionError(from, to);
    }
  },

  /**
   * Calcula transições manuais disponíveis para o estado/contexto atual.
   * Transições sistêmicas ficam de fora e são feitas pelos módulos corretos
   * (orçamento, compra, recebimento, reabertura etc.).
   */
  availableTransitions(context: ServiceOrderTransitionContext): ServiceOrderTransitionDto[] {
    return (SERVICE_ORDER_MANUAL_TRANSITIONS[context.status] ?? []).map((definition) => ({
      ...definition,
      disabledReason: getDisabledReason(context, definition.status),
    }));
  },

  /** Valida transição manual com matriz + guardas contextuais. */
  assertManualTransition(context: ServiceOrderTransitionContext, to: ServiceOrderStatus): void {
    this.assertTransition(context.status, to);

    const definition = getManualTransitionDefinition(context.status, to);
    if (!definition) {
      throw new InvalidStateTransitionError(context.status, to);
    }

    const disabledReason = getDisabledReason(context, to);
    if (disabledReason) {
      throw new ServiceOrderDomainError(disabledReason);
    }
  },

  isTerminal(status: ServiceOrderStatus): boolean {
    return isTerminalStatus(status);
  },

  /**
   * OS somente-leitura não pode ser editada: status terminal (ENTREGUE/CANCELADA)
   * ou orçamento aprovado/aguardando peça (é preciso reabrir para editar).
   */
  assertEditable(status: ServiceOrderStatus): void {
    if (isOrderEditable(status)) return;
    if (status === 'ORCAMENTO_APROVADO' || status === 'AGUARDANDO_PECA') {
      throw new ServiceOrderDomainError('Orçamento aprovado: reabra o orçamento para editar a OS.');
    }
    throw new ServiceOrderDomainError('OS finalizada ou cancelada não pode ser alterada');
  },
} as const;

function getDisabledReason(
  context: ServiceOrderTransitionContext,
  to: ServiceOrderStatus,
): string | null {
  const definition = getManualTransitionDefinition(context.status, to);
  if (!definition) return 'Transição não disponível neste estágio da OS.';

  if (definition.requiresDiagnosis && (context.diagnosis ?? '').trim() === '') {
    return 'Preencha e salve o diagnóstico técnico antes de concluir o diagnóstico.';
  }

  if (definition.requiresQuote && context.quoteStatus !== 'ENVIADO') {
    return 'Gere e envie o orçamento antes de registrar aprovação ou recusa manual.';
  }

  if (to === 'ORCAMENTO_APROVADO' && context.status === 'ORCAMENTO' && context.itemCount === 0) {
    return 'Adicione itens à OS antes de aprovar o orçamento.';
  }

  return null;
}
