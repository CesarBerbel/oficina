/** Mantém apenas dígitos em textos de documentos, telefones e CEP. */
export function onlyDigits(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

/** Máscara BR para telefone fixo/celular: (99) 9999-9999 ou (99) 99999-9999. */
export function maskPhone(value: string | null | undefined): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

/** Aplica máscara de telefone apenas quando o texto parece ser telefone. */
export function maskPhoneOrEmail(value: string | null | undefined): string {
  const raw = value ?? '';
  if (/[a-z@]/i.test(raw)) return raw;
  return maskPhone(raw);
}

/** Máscara de CEP: 99999-999. */
export function maskCep(value: string | null | undefined): string {
  const digits = onlyDigits(value).slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Máscara de CPF: 999.999.999-99. */
export function maskCpf(value: string | null | undefined): string {
  const digits = onlyDigits(value).slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Máscara de CNPJ: 99.999.999/9999-99. */
export function maskCnpj(value: string | null | undefined): string {
  const digits = onlyDigits(value).slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  }
  if (digits.length <= 12) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Usa CPF até 11 dígitos e CNPJ acima disso. */
export function maskCpfCnpj(value: string | null | undefined): string {
  const digits = onlyDigits(value);
  return digits.length > 11 ? maskCnpj(digits) : maskCpf(digits);
}
