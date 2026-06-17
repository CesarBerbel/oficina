import type { Metadata } from 'next';
import { getPublicSite } from '@/lib/public-api';
import { formatCurrency } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = { title: 'Serviços' };

export default async function SiteServicos() {
  const data = await getPublicSite();
  const services = data?.services ?? [];
  const cardImage = data?.settings.serviceCardImageUrl || null;

  return (
    <div className="container py-16">
      <h1 className="text-3xl font-bold tracking-tight">Serviços</h1>
      <p className="mt-1 text-muted-foreground">O que fazemos pela sua oficina.</p>

      {services.length === 0 ? (
        <p className="mt-10 text-muted-foreground">Nenhum serviço cadastrado.</p>
      ) : (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <div key={s.id} className="overflow-hidden rounded-xl border bg-card">
              {cardImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cardImage} alt={s.name} className="h-36 w-full object-cover" />
              )}
              <div className="p-5">
                {s.category && (
                  <span className="text-xs font-medium uppercase text-primary">{s.category}</span>
                )}
                <h3 className="mt-1 font-medium">{s.name}</h3>
                {s.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
                )}
                {s.salePrice > 0 && (
                  <p className="mt-3 font-semibold">{formatCurrency(s.salePrice)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
