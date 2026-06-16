'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/**
 * Provedor de confirmação imperativa. Expõe `useConfirm()`, que retorna uma
 * função `confirm(opts) => Promise<boolean>` — substituto direto do `confirm()`
 * nativo, porém com Dialog estilizado (shadcn) e suporte a ação destrutiva.
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = React.useCallback((result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        {options && (
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{options.title}</DialogTitle>
              {options.description && (
                <DialogDescription>{options.description}</DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => settle(false)}>
                {options.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                variant={options.destructive ? 'destructive' : 'default'}
                onClick={() => settle(true)}
                autoFocus
              >
                {options.confirmLabel ?? 'Confirmar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>');
  }
  return ctx;
}
