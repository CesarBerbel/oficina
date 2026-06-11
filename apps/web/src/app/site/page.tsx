import Link from 'next/link';
import { Wrench, ArrowRight, ShieldCheck, Clock } from 'lucide-react';
import { getPublicSite } from '@/lib/public-api';
import { formatCurrency } from '@/lib/utils';

export default async function SiteHome() {
  const data = await getPublicSite();
  if (!data) {
    return (
      <div className="container grid place-items-center py-32 text-center">
        <p className="text-muted-foreground">Site não publicado.</p>
      </div>
    );
  }
  const s = data.settings;

  return (
    <>
      <section className="border-b bg-gradient-to-b from-primary/5 to-background">
        <div className="container flex flex-col items-center gap-5 py-20 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <Wrench className="size-7" />
          </span>
          <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
            {s.heroTitle ?? s.shopName}
          </h1>
          <p className="max-w-xl text-pretty text-muted-foreground">
            {s.heroSubtitle ?? s.tagline ?? 'Serviço de qualidade para o seu veículo.'}
          </p>
          <div className="flex gap-3">
            <Link href="/site/contato" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground">
              Pedir orçamento <ArrowRight className="size-4" />
            </Link>
            <Link href="/site/servicos" className="inline-flex items-center rounded-md border px-5 py-2.5 font-medium">
              Ver serviços
            </Link>
          </div>
        </div>
      </section>

      {data.services.length > 0 && (
        <section className="container py-16">
          <h2 className="mb-6 text-2xl font-bold">Nossos serviços</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.services.slice(0, 9).map((svc) => (
              <div key={svc.id} className="rounded-xl border bg-card p-5">
                <h3 className="font-medium">{svc.name}</h3>
                {svc.description && <p className="mt-1 text-sm text-muted-foreground">{svc.description}</p>}
                {svc.salePrice > 0 && (
                  <p className="mt-2 text-sm font-semibold text-primary">a partir de {formatCurrency(svc.salePrice)}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="border-t bg-muted/40">
        <div className="container grid gap-6 py-16 sm:grid-cols-3">
          <Feature icon={ShieldCheck} title="Confiança" text="Serviço honesto e com garantia." />
          <Feature icon={Clock} title="Agilidade" text="Acompanhe sua OS online em tempo real." />
          <Feature icon={Wrench} title="Qualidade" text="Peças e mão de obra de qualidade." />
        </div>
      </section>
    </>
  );
}

function Feature({ icon: Icon, title, text }: { icon: typeof Wrench; title: string; text: string }) {
  return (
    <div className="text-center">
      <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
