import { ServiceOrderStatus } from '@oficina/shared';
import { ServiceOrderStateMachine as SM } from './service-order.state-machine';
import {
  InvalidStateTransitionError,
  ServiceOrderDomainError,
} from './service-order.errors';

describe('ServiceOrderStateMachine', () => {
  it('permite o caminho feliz completo', () => {
    const path: ServiceOrderStatus[] = [
      'ENTRADA',
      'DIAGNOSTICO_PRONTO',
      'ORCAMENTO',
      'ORCAMENTO_APROVADO',
      'EM_EXECUCAO',
      'EM_TESTE',
      'PRONTA',
      'PRONTO_RETIRAR',
      'ENTREGUE',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(() => SM.assertTransition(path[i], path[i + 1])).not.toThrow();
    }
  });

  it('permite cancelar de status não-terminais', () => {
    expect(() => SM.assertTransition('ENTRADA', 'CANCELADA')).not.toThrow();
    expect(() =>
      SM.assertTransition('EM_EXECUCAO', 'CANCELADA'),
    ).not.toThrow();
  });

  it('rejeita pulo de status', () => {
    expect(() => SM.assertTransition('ENTRADA', 'EM_EXECUCAO')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('rejeita transição a partir de status terminal', () => {
    expect(() => SM.assertTransition('ENTREGUE', 'EM_EXECUCAO')).toThrow(
      InvalidStateTransitionError,
    );
    expect(() => SM.assertTransition('CANCELADA', 'ENTRADA')).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('rejeita transição para o mesmo status', () => {
    expect(() => SM.assertTransition('ENTRADA', 'ENTRADA')).toThrow(
      ServiceOrderDomainError,
    );
  });

  it('permite voltar de EM_TESTE para EM_EXECUCAO (retrabalho)', () => {
    expect(() => SM.assertTransition('EM_TESTE', 'EM_EXECUCAO')).not.toThrow();
  });

  it('bloqueia edição em status terminal', () => {
    expect(() => SM.assertEditable('ENTREGUE')).toThrow(ServiceOrderDomainError);
    expect(() => SM.assertEditable('CANCELADA')).toThrow(
      ServiceOrderDomainError,
    );
    expect(() => SM.assertEditable('EM_EXECUCAO')).not.toThrow();
  });
});
