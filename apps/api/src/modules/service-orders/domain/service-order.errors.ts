/** Erro de regra de negócio da OS. Traduzido para HTTP na camada de interface. */
export class ServiceOrderDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServiceOrderDomainError';
  }
}

export class InvalidStateTransitionError extends ServiceOrderDomainError {
  constructor(from: string, to: string) {
    super(`Transição de status inválida: ${from} → ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}
