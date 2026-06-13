import { ServiceOrderStatus } from '@oficina/shared';
import { ServiceOrderStateMachine as SM } from './service-order.state-machine';
import {
  InvalidStateTransitionError,
  ServiceOrderDomainError,
} from './service-order.errors';

const context = (
  overrides: Partial<Parameters<typeof SM.availableTransitions>[0]> = {},
) => ({
  status: 'ENTRADA' as ServiceOrderStatus,
  diagnosis: 'Diagnóstico técnico preenchido',
  itemCount: 1,
  quoteStatus: null,
  ...overrides,
});

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

  it('bloqueia edição com orçamento aprovado ou aguardando peça', () => {
    expect(() => SM.assertEditable('ORCAMENTO_APROVADO')).toThrow(
      ServiceOrderDomainError,
    );
    expect(() => SM.assertEditable('AGUARDANDO_PECA')).toThrow(
      ServiceOrderDomainError,
    );
  });

  it('permite reabrir o orçamento no domínio, mas não como ação manual de status', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO_APROVADO', 'DIAGNOSTICO_PRONTO'),
    ).not.toThrow();
    expect(() =>
      SM.assertManualTransition(
        context({ status: 'ORCAMENTO_APROVADO' }),
        'DIAGNOSTICO_PRONTO',
      ),
    ).toThrow(InvalidStateTransitionError);
  });

  it('permite aprovar com falta de peça como transição sistêmica', () => {
    expect(() =>
      SM.assertTransition('ORCAMENTO', 'AGUARDANDO_PECA'),
    ).not.toThrow();
    expect(() =>
      SM.assertManualTransition(
        context({ status: 'ORCAMENTO', quoteStatus: 'ENVIADO' }),
        'AGUARDANDO_PECA',
      ),
    ).toThrow(InvalidStateTransitionError);
  });

  it('da AGUARDANDO_PECA avança para aprovado ou execução', () => {
    expect(() =>
      SM.assertTransition('AGUARDANDO_PECA', 'ORCAMENTO_APROVADO'),
    ).not.toThrow();
    expect(() =>
      SM.assertTransition('AGUARDANDO_PECA', 'EM_EXECUCAO'),
    ).not.toThrow();
  });

  it('bloqueia ação manual de diagnóstico pronto sem diagnóstico salvo', () => {
    const actionContext = context({ status: 'ENTRADA', diagnosis: '' });

    expect(() =>
      SM.assertManualTransition(actionContext, 'DIAGNOSTICO_PRONTO'),
    ).toThrow(ServiceOrderDomainError);

    expect(
      SM.availableTransitions(actionContext).find(
        (item) => item.status === 'DIAGNOSTICO_PRONTO',
      )?.disabledReason,
    ).toContain('diagnóstico técnico');
  });

  it('bloqueia aprovação/recusa manual sem orçamento enviado', () => {
    const actionContext = context({ status: 'ORCAMENTO', quoteStatus: null });

    expect(() =>
      SM.assertManualTransition(actionContext, 'ORCAMENTO_APROVADO'),
    ).toThrow(ServiceOrderDomainError);
    expect(() =>
      SM.assertManualTransition(actionContext, 'ORCAMENTO_RECUSADO'),
    ).toThrow(ServiceOrderDomainError);
  });

  it('permite aprovação manual com orçamento enviado', () => {
    expect(() =>
      SM.assertManualTransition(
        context({ status: 'ORCAMENTO', quoteStatus: 'ENVIADO' }),
        'ORCAMENTO_APROVADO',
      ),
    ).not.toThrow();
  });

  it('não expõe transições sistêmicas como ação manual', () => {
    const actions = SM.availableTransitions(
      context({ status: 'DIAGNOSTICO_PRONTO' }),
    ).map((item) => item.status);

    expect(actions).not.toContain('ORCAMENTO');
    expect(actions).toContain('CANCELADA');
  });
});
