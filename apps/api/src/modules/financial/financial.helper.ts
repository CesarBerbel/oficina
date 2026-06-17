import { BadRequestException } from '@nestjs/common';

export function calculateFinancialSettlement(input: {
  amount: number;
  paidAmount: number;
  paymentAmount: number;
}): { paidAmount: number; remainingAmount: number; status: 'PARTIAL' | 'PAID' } {
  const amount = Math.round(input.amount * 100) / 100;
  const paidBefore = Math.round(input.paidAmount * 100) / 100;
  const payment = Math.round(input.paymentAmount * 100) / 100;
  if (amount <= 0) throw new BadRequestException('Valor do lançamento deve ser maior que zero');
  if (payment <= 0) throw new BadRequestException('Valor da baixa deve ser maior que zero');
  const remainingBefore = Math.max(0, Math.round((amount - paidBefore) * 100) / 100);
  if (payment > remainingBefore)
    throw new BadRequestException('Valor da baixa maior que o saldo em aberto');
  const paidAmount = Math.round((paidBefore + payment) * 100) / 100;
  const remainingAmount = Math.max(0, Math.round((amount - paidAmount) * 100) / 100);
  return { paidAmount, remainingAmount, status: remainingAmount <= 0 ? 'PAID' : 'PARTIAL' };
}
