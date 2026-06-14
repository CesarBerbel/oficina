import type { Metadata } from 'next';
import { Phone, Mail, Clock } from 'lucide-react';
import { getPublicSite } from '@/lib/public-api';
import { maskPhone } from '@/lib/masks';
import { LeadForm } from './lead-form';
import { SiteAddressLinks } from '@/components/site/site-address-links';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = { title: 'Contato' };

export default async function SiteContato() {
  const data = await getPublicSite();
  const s = data?.settings;

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold tracking-tight">Contato</h1>
      <p className="mt-1 text-muted-foreground">Peça um orçamento ou tire suas dúvidas.</p>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div className="space-y-4">
          <LeadForm />
          <div className="space-y-2 rounded-xl border bg-card p-5 text-sm">
            {s?.phone && <p className="flex items-center gap-2"><Phone className="size-4 text-primary" /> {maskPhone(s.phone)}</p>}
            {s?.whatsapp && (
              <p className="flex items-center gap-2">
                <Phone className="size-4 text-primary" />
                <a className="hover:underline" href={`https://wa.me/${s.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">
                  WhatsApp: {maskPhone(s.whatsapp)}
                </a>
              </p>
            )}
            {s?.email && <p className="flex items-center gap-2"><Mail className="size-4 text-primary" /> {s.email}</p>}
            {s?.address && (
              <SiteAddressLinks
                address={s.address}
                iconClassName="size-4"
              />
            )}
            {s?.hours && <p className="flex items-center gap-2"><Clock className="size-4 text-primary" /> {s.hours}</p>}
          </div>
        </div>

        {s?.mapsEmbed ? (
          <div
            className="min-h-[360px] overflow-hidden rounded-xl border [&_iframe]:h-full [&_iframe]:w-full"
            // O embed do Google Maps é colado pelo admin (campo controlado).
            dangerouslySetInnerHTML={{ __html: s.mapsEmbed }}
          />
        ) : (
          <div className="grid min-h-[360px] place-items-center rounded-xl border bg-muted/40 text-sm text-muted-foreground">
            Mapa não configurado.
          </div>
        )}
      </div>
    </div>
  );
}
