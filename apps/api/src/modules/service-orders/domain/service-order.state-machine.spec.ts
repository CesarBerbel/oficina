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

  it('permite recusar o orçamento (ORCAMENTO -> ORCAMENTO_RECUSADO)', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO', 'ORCAMENTO_RECUSADO'),
    ).not.toThrow();
  });

  it('permite gerar novo orçamento após recusa (ORCAMENTO_RECUSADO -> ORCAMENTO)', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO_RECUSADO', 'ORCAMENTO'),
    ).not.toThrow();
    expect(() =>
      SM.assertTransition('ORCAMENTO_RECUSADO', 'CANCELADA'),
    ).not.toThrow();
  });

  it('bloqueia edição em status terminal', () => {
    expect(() => SM.assertEditable('ENTREGUE')).toThrow(ServiceOrderDomainError);
    expect(() => SM.assertEditable('CANCELADA')).toThrow(
      ServiceOrderDomainError,
    );
    expect(() => SM.assertEditable('EM_EXECUCAO')).not.toThrow();
  });

  it('bloqueia edição com orçamento aprovado (somente leitura)', () => {
    expect(() => SM.assertEditable('ORCAMENTO_APROVADO')).toThrow(
      ServiceOrderDomainError,
    );
  });

  it('permite reabrir o orçamento (ORCAMENTO_APROVADO -> DIAGNOSTICO_PRONTO)', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO_APROVADO', 'DIAGNOSTICO_PRONTO'),
    ).not.toThrow();
  });

  it('permite aprovar com falta de peça (ORCAMENTO -> AGUARDANDO_PECA)', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO', 'AGUARDANDO_PECA'),
    ).not.toThrow();
  });

  it('da AGUARDANDO_PECA avança para aprovado ou execução', () => {
    expect(() =>
      SM.assertTransition('AGUARDANDO_PECA', 'ORCAMENTO_APROVADO'),
    ).not.toThrow();
    expect(() =>
      SM.assertTransition('AGUARDANDO_PECA', 'EM_EXECUCAO'),
    ).not.toThrow();
  });

  it('permite reabrir o orçamento aguardando peça (AGUARDANDO_PECA -> DIAGNOSTICO_PRONTO)', () => {
    expect(() =>
      SM.assertTransition('AGUARDANDO_PECA', 'DIAGNOSTICO_PRONTO'),
    ).not.toThrow();
  });

  it('bloqueia edição aguardando peça (somente leitura)', () => {
    expect(() => SM.assertEditable('AGUARDANDO_PECA')).toThrow(
      ServiceOrderDomainError,
    );
  });
});
