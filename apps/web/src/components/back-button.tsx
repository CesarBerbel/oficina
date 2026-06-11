'use client';

import { ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';

interface BackButtonProps extends Omit<ButtonProps, 'onClick' | 'asChild'> {
  fallbackHref: string;
  label?: string;
  iconOnly?: boolean;
  returnParamNames?: string[];
}

function safeInternalPath(value: string | null): string | null {
  if (!value) return null;
  try {
    const decoded = decodeURIComponent(value);
    const url = new URL(decoded, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

/**
 * Botão de retorno contextual. Prioriza ?returnTo=/rota, depois volta no
 * histórico do navegador e, por fim, usa um fallback seguro.
 */
export function BackButton({
  fallbackHref,
  label = 'Voltar',
  iconOnly = false,
  returnParamNames = ['returnTo', 'from'],
  variant = 'ghost',
  size = iconOnly ? 'icon' : 'sm',
  type = 'button',
  ...props
}: BackButtonProps) {
  const router = useRouter();

  function goBack() {
    const search = new URLSearchParams(window.location.search);
    for (const paramName of returnParamNames) {
      const target = safeInternalPath(search.get(paramName));
      if (target) {
        router.push(target);
        return;
      }
    }

    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <Button
      {...props}
      type={type}
      variant={variant}
      size={size}
      onClick={goBack}
      aria-label={props['aria-label'] ?? (iconOnly ? label : undefined)}
    >
      <ArrowLeft className={iconOnly ? 'size-5' : 'size-4'} />
      {!iconOnly && label}
    </Button>
  );
}
