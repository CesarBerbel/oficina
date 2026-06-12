import Link from 'next/link';
import type { Metadata } from 'next';
import { Wrench, Phone, Mail, MapPin, Clock, Lock } from 'lucide-react';
import { getPublicSite } from '@/lib/public-api';
import { maskCnpj, maskPhone } from '@/lib/masks';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublicSite();
  const name = data?.settings.shopName ?? 'Oficina';
  return {
    title: { default: name, template: `%s · ${name}` },
    description: data?.settings.tagline ?? 'Oficina mecânica',
  };
}

const NAV = [
  { href: '/site', label: 'Início' },
  { href: '/site/servicos', label: 'Serviços' },
  { href: '/site/sobre', label: 'Sobre' },
  { href: '/site/blog', label: 'Blog' },
  { href: '/site/consulta', label: 'Consultar OS' },
  { href: '/site/contato', label: 'Contato' },
];

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const data = await getPublicSite();
  const s = data?.settings;
  const name = s?.shopName ?? 'Oficina';

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/site" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </span>
            {name}
          </Link>
          <nav className="hidden gap-6 text-sm font-medium sm:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="text-muted-foreground hover:text-foreground">
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Lock className="size-4" /> Área restrita
            </Link>
            {s?.whatsapp && (
              <a
                href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
              >
                WhatsApp
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-muted/40">
        <div className="container grid gap-6 py-10 sm:grid-cols-3">
          <div>
            <p className="font-semibold">{name}</p>
            {s?.tagline && <p className="mt-1 text-sm text-muted-foreground">{s.tagline}</p>}
            {s?.cnpj && <p className="mt-2 text-xs text-muted-foreground">CNPJ: {maskCnpj(s.cnpj)}</p>}
          </div>
          <div className="space-y-1 text-sm text-muted-foreground">
            {s?.phone && <p className="flex items-center gap-2"><Phone className="size-4" /> {maskPhone(s.phone)}</p>}
            {s?.email && <p className="flex items-center gap-2"><Mail className="size-4" /> {s.email}</p>}
            {s?.address && <p className="flex items-center gap-2"><MapPin className="size-4" /> {s.address}</p>}
            {s?.hours && <p className="flex items-center gap-2"><Clock className="size-4" /> {s.hours}</p>}
          </div>
          <div className="flex gap-4 text-sm sm:justify-end">
            {s?.instagram && <a href={s.instagram} className="text-muted-foreground hover:text-foreground" target="_blank" rel="noopener noreferrer">Instagram</a>}
            {s?.facebook && <a href={s.facebook} className="text-muted-foreground hover:text-foreground" target="_blank" rel="noopener noreferrer">Facebook</a>}
          </div>
        </div>
        <div className="border-t py-4 text-center text-xs text-muted-foreground">
          © {name}
        </div>
      </footer>
    </div>
  );
}
