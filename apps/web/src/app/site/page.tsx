import Link from 'next/link';
import {
  Wrench,
  ArrowRight,
  ShieldCheck,
  Zap,
  MessageCircle,
  Car,
  Phone,
  MapPin,
  Clock,
  Star,
  Search,
} from 'lucide-react';
import { getPublicSite, getPublicBlog } from '@/lib/public-api';
import { BLOG_FALLBACK_IMAGE } from '@/lib/blog';
import { formatCurrency } from '@/lib/utils';
import { maskPhone } from '@/lib/masks';

const BENEFITS = [
  { icon: ShieldCheck, title: 'Qualidade garantida', text: 'Peças de procedência e serviço com garantia.' },
  { icon: Zap, title: 'Agilidade', text: 'Diagnóstico rápido para você voltar logo à estrada.' },
  { icon: MessageCircle, title: 'Transparência', text: 'Orçamento claro, com aprovação antes de executar.' },
  { icon: Car, title: 'Multimarcas', text: 'Atendemos as principais marcas de veículos.' },
];

// Depoimentos de exemplo — edite/substitua pelos reais quando quiser.
const TESTIMONIALS = [
  { name: 'Marcelo A.', text: 'Atendimento honesto e direto. Explicaram tudo antes e o preço foi justo.' },
  { name: 'Patrícia L.', text: 'Resolveram um problema que outras oficinas não acharam. Recomendo!' },
  { name: 'Rafael S.', text: 'Serviço rápido e de confiança. Meu carro voltou novo.' },
];

export default async function SiteHome() {
  const [data, posts] = await Promise.all([
    getPublicSite(),
    getPublicBlog().then((p) => p ?? []),
  ]);
  if (!data) {
    return (
      <div className="container grid place-items-center py-32 text-center">
        <p className="text-muted-foreground">Site não publicado.</p>
      </div>
    );
  }
  const s = data.settings;
  const waNumber = s.whatsapp?.replace(/\D/g, '') || '';
  const waHref = waNumber ? `https://wa.me/${waNumber}` : null;
  const phones = [s.phone, s.whatsapp].filter(Boolean) as string[];

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        {s.heroImageUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.heroImageUrl}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover brightness-[0.4]"
            />
            {/* Sobreposição suave para o texto ficar legível e a imagem não competir. */}
            <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/55 to-background" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-background to-background" />
        )}
        <div className="container relative z-10 flex flex-col items-center gap-6 py-28 text-center sm:py-40">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Wrench className="size-3.5 text-primary" /> Mecânica multimarcas
          </span>
          <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            {s.heroTitle ?? 'Cuidamos do seu carro como se fosse nosso'}
          </h1>
          <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
            {s.heroSubtitle ??
              s.tagline ??
              'Mecânica geral multimarcas com diagnóstico preciso, peças de qualidade e atendimento honesto.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/site/contato"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Pedir orçamento <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/site/consulta"
              className="inline-flex items-center gap-2 rounded-md border px-5 py-2.5 font-medium hover:bg-accent"
            >
              <Search className="size-4" /> Consultar veículo
            </Link>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-5 py-2.5 font-medium text-white transition-colors hover:bg-[#1fb855]"
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
          {phones.length > 0 && (
            <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {phones.map((p) => (
                <a key={p} href={`tel:${p.replace(/\D/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="size-4" /> {maskPhone(p)}
                </a>
              ))}
            </p>
          )}
        </div>
      </section>

      {/* Diferenciais */}
      <section className="container py-14">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((b) => (
            <div key={b.title} className="rounded-xl border bg-card p-5">
              <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon className="size-5" />
              </span>
              <h3 className="font-semibold">{b.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Serviços */}
      {data.services.length > 0 && (
        <section className="container py-14">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Nossos serviços</h2>
              <p className="text-muted-foreground">O que fazemos pelo seu veículo.</p>
            </div>
            <Link href="/site/servicos" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver todos os serviços <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.services.slice(0, 6).map((svc) => (
              <div key={svc.id} className="overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary">
                {s.serviceCardImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.serviceCardImageUrl} alt={svc.name} className="h-40 w-full object-cover" />
                )}
                <div className="p-5">
                  {svc.category && (
                    <span className="text-xs font-medium uppercase text-primary">{svc.category}</span>
                  )}
                  <h3 className="mt-1 font-semibold">{svc.name}</h3>
                  {svc.description && <p className="mt-1 text-sm text-muted-foreground">{svc.description}</p>}
                  {svc.salePrice > 0 && (
                    <p className="mt-3 text-sm font-semibold text-primary">a partir de {formatCurrency(svc.salePrice)}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Sobre + horário/endereço */}
      <section className="border-y bg-muted/30">
        <div className="container grid gap-8 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sobre a {s.shopName}</h2>
            <p className="mt-3 text-pretty text-muted-foreground">
              {s.about ??
                'Mecânica geral multimarcas focada em diagnóstico preciso, peças de qualidade e atendimento honesto. Cuidamos do seu carro com a transparência que você merece.'}
            </p>
            <Link href="/site/sobre" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Saiba mais <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-3 rounded-xl border bg-card p-6 text-sm">
            {s.hours && (
              <p className="flex items-start gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="whitespace-pre-line">{s.hours}</span>
              </p>
            )}
            {s.address && (
              <p className="flex items-start gap-3">
                <MapPin className="mt-0.5 size-5 shrink-0 text-primary" /> {s.address}
              </p>
            )}
            {phones.map((p) => (
              <p key={p} className="flex items-center gap-3">
                <Phone className="size-5 shrink-0 text-primary" /> {maskPhone(p)}
              </p>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section className="container py-16">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">O que dizem nossos clientes</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="rounded-xl border bg-card p-5">
              <div className="flex gap-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="size-4 fill-current" />
                ))}
              </div>
              <p className="mt-3 text-sm text-muted-foreground">“{t.text}”</p>
              <p className="mt-3 text-sm font-medium">{t.name}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Blog */}
      {posts.length > 0 && (
        <section className="border-t bg-muted/30">
          <div className="container py-16">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-2xl font-bold tracking-tight">Do nosso blog</h2>
              <Link href="/site/blog" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Ver todos <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="grid gap-6 sm:grid-cols-3">
              {posts.slice(0, 3).map((p) => (
                <Link key={p.slug} href={`/site/blog/${p.slug}`} className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.imageUrl || s.blogFallbackImageUrl || BLOG_FALLBACK_IMAGE} alt={p.title} className="h-40 w-full object-cover" />
                  <div className="p-5">
                    <h3 className="font-semibold group-hover:text-primary">{p.title}</h3>
                    {p.excerpt && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.excerpt}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Chamada final */}
      <section className="container py-16">
        <div className="flex flex-col items-center gap-5 rounded-2xl border bg-gradient-to-b from-primary/10 to-card p-10 text-center">
          <h2 className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Precisa de um orçamento ou diagnóstico?
          </h2>
          <p className="max-w-lg text-muted-foreground">
            Fale com a gente e cuide do seu carro com quem você pode confiar.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/site/contato" className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90">
              Pedir orçamento <ArrowRight className="size-4" />
            </Link>
            {waHref && (
              <a href={waHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-md bg-[#25D366] px-5 py-2.5 font-medium text-white hover:bg-[#1fb855]">
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
