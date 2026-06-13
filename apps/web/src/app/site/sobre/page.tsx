import type { Metadata } from 'next';
import { getPublicSite } from '@/lib/public-api';
import { SiteAddressLinks } from '@/components/site/site-address-links';

export const metadata: Metadata = { title: 'Sobre' };

export default async function SiteSobre() {
  const data = await getPublicSite();
  const s = data?.settings;

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold tracking-tight">Sobre {s?.shopName ?? 'a oficina'}</h1>
      {s?.tagline && <p className="mt-2 text-lg text-muted-foreground">{s.tagline}</p>}
      <div className="mt-6 whitespace-pre-wrap text-pretty leading-relaxed">
        {s?.about ?? 'Em breve, mais informações sobre a nossa oficina.'}
      </div>
      {s?.aboutExtra && (
        <div className="mt-4 whitespace-pre-wrap text-pretty leading-relaxed text-muted-foreground">
          {s.aboutExtra}
        </div>
      )}

      {(s?.address || s?.hours) && (
        <div className="mt-8 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
          {s?.address && (
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Endereço</p>
              <SiteAddressLinks
                address={s.address}
                className="mt-1"
                showIcon={false}
              />
            </div>
          )}
          {s?.hours && (
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Horário</p>
              <p>{s.hours}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
