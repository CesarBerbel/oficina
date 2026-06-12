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
  const waNumber = s?.whatsapp?.replace(/\D/g, '') || '';
  const waHref = waNumber ? `https://wa.me/${waNumber}` : null;

  return (
    <div className="theme-dark flex min-h-dvh flex-col bg-background text-foreground">
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
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1fb855]"
              >
                <WhatsappIcon className="size-4" /> WhatsApp
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

      {/* Botão flutuante do WhatsApp */}
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Falar no WhatsApp"
          className="fixed bottom-5 right-5 z-50 flex size-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-black/25 ring-4 ring-[#25D366]/20 transition-transform hover:scale-110"
        >
          <WhatsappIcon className="size-8" />
        </a>
      )}
    </div>
  );
}

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}
