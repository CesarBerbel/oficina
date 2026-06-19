'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { NAV_SECTIONS } from '@/lib/navigation';

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasPermission, user } = useAuth();

  // Super admin (plataforma) vê SOMENTE os itens de plataforma; demais usuários
  // veem apenas os itens de oficina (por permissão).
  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) =>
      user?.platformAdmin
        ? item.platformAdmin === true
        : !item.platformAdmin && (!item.permission || hasPermission(item.permission)),
    ),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex h-16 items-center gap-2 px-5 font-semibold">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Wrench className="size-4" />
        </span>
        Oficina
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-accent',
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );
}
