import { BadRequestException } from '@nestjs/common';
import { calculateFinancialSettlement } from './financial.helper';

describe('calculateFinancialSettlement', () => {
  it('mantém lançamento parcial quando a baixa é menor que o saldo', () => {
    expect(calculateFinancialSettlement({ amount: 100, paidAmount: 20, paymentAmount: 30 })).toEqual({
      paidAmount: 50,
      remainingAmount: 50,
      status: 'PARTIAL',
    });
  });

  it('quita lançamento quando a baixa fecha o saldo', () => {
    expect(calculateFinancialSettlement({ amount: 100, paidAmount: 25, paymentAmount: 75 })).toEqual({
      paidAmount: 100,
      remainingAmount: 0,
      status: 'PAID',
    });
  });

  it('bloqueia baixa maior que o saldo em aberto', () => {
    expect(() => calculateFinancialSettlement({ amount: 100, paidAmount: 80, paymentAmount: 25 })).toThrow(BadRequestException);
  });
});
