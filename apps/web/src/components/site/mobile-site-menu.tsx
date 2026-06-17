'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Lock, Menu, Phone, X } from 'lucide-react';

type SiteNavItem = {
  href: string;
  label: string;
};

function isActive(pathname: string, href: string) {
  if (href === '/site') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileSiteMenu({ nav, waHref }: { nav: SiteNavItem[]; waHref: string | null }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  function close() {
    setOpen(false);
  }

  return (
    <div className="relative md:hidden">
      <button
        type="button"
        aria-label={open ? 'Fechar menu' : 'Abrir menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex size-10 items-center justify-center rounded-md border bg-background/80 text-foreground shadow-sm transition-colors hover:bg-accent"
      >
        {open ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-card shadow-xl shadow-black/30">
          <nav className="grid p-2" aria-label="Menu principal mobile">
            {nav.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={
                    active
                      ? 'rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground'
                      : 'rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="border-t p-2">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={close}
                className="mb-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1fb855]"
              >
                <Phone className="size-4" /> WhatsApp
              </a>
            )}
            <Link
              href="/login"
              onClick={close}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Lock className="size-4" /> Área restrita
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
