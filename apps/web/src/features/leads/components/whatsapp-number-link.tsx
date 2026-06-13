'use client';

import { MessageCircle } from 'lucide-react';
import { buildWhatsAppHref } from '@/lib/contact-links';
import { maskPhone } from '@/lib/masks';
import { cn } from '@/lib/utils';

export function WhatsAppNumberLink({
  value,
  label,
  showIcon = false,
  className,
  onClick,
}: {
  value: string | null | undefined;
  label?: string;
  showIcon?: boolean;
  className?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const href = buildWhatsAppHref(value);
  if (!href || !value) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={onClick}
      className={cn('inline-flex items-center gap-1.5 hover:text-primary hover:underline', className)}
    >
      {showIcon && <MessageCircle className="size-3.5" />}
      {label ? `${label}: ` : null}
      {maskPhone(value)}
    </a>
  );
}
