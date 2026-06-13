import * as React from 'react';
import { Input, type InputProps } from './input';

export function formatMoneyInputFromNumber(value: number | null | undefined): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value ?? 0);
}

export function formatMoneyInputValue(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return formatMoneyInputFromNumber(Number(digits) / 100);
}

export function moneyInputToNumber(value: string): number {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  return Number(digits) / 100;
}

type MoneyInputProps = Omit<InputProps, 'type' | 'value' | 'onChange'> & {
  value: string;
  onValueChange: (value: string) => void;
};

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onValueChange, placeholder = 'R$ 0,00', inputMode = 'numeric', ...props }, ref) => (
    <Input
      {...props}
      ref={ref}
      type="text"
      inputMode={inputMode}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onValueChange(formatMoneyInputValue(event.target.value))}
    />
  ),
);
MoneyInput.displayName = 'MoneyInput';
