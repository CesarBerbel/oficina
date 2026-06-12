'use client';

import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { CarLoader } from '@/components/car-loader';

/**
 * Overlay global de "processando". Aparece sempre que há alguma ação em
 * andamento (mutations do react-query: salvar, gerar, receber, etc.).
 * Tem um pequeno atraso para não piscar em ações instantâneas.
 */
export function ProcessingOverlay() {
  const mutating = useIsMutating();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (mutating > 0) {
      const t = setTimeout(() => setShow(true), 250);
      return () => clearTimeout(t);
    }
    setShow(false);
    return undefined;
  }, [mutating]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-background/60 backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-10 py-7 shadow-xl">
        <CarLoader size={60} className="text-primary" />
        <p className="text-sm font-medium text-muted-foreground">Processando…</p>
      </div>
    </div>
  );
}
