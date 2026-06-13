import Link from 'next/link';
import {
  Wrench,
  ArrowRight,
  ShieldCheck,
  Zap,
  MessageCircle,
  Car,
  Phone,
  Clock,
  Star,
  Search,
} from 'lucide-react';
import { getPublicSite, getPublicBlog } from '@/lib/public-api';
import { BLOG_FALLBACK_IMAGE } from '@/lib/blog';
import { formatCurrency } from '@/lib/utils';
import { maskPhone } from '@/lib/masks';
import { buildTelHref, buildWhatsAppHref, samePhoneDigits } from '@/lib/contact-links';
import { BrandMarquee } from '@/components/site/brand-marquee';
import { SiteAddressLinks } from '@/components/site/site-address-links';

const BENEFITS = [
  {
    icon: ShieldCheck,
    title: 'Qualidade garantida',
    text: 'Peças de procedência e serviço com garantia.',
  },
  {
    icon: Zap,
    title: 'Agilidade',
    text: 'Diagnóstico rápido para você voltar logo à estrada.',
  },
  {
    icon: MessageCircle,
    title: 'Transparência',
    text: 'Orçamento claro, com aprovação antes de executar.',
  },
  {
    icon: Car,
    title: 'Multimarcas',
    text: 'Atendemos as principais marcas de veículos.',
  },
];

const FALLBACK_SERVICES = [
  {
    id: 'fallback-diagnostico',
    name: 'Diagnóstico eletrônico',
    description:
      'Leitura de falhas, análise técnica e orientação clara antes de qualquer reparo.',
    category: 'Diagnóstico',
    salePrice: 0,
  },
  {
    id: 'fallback-revisao',
    name: 'Revisão preventiva',
    description:
      'Checagem dos principais sistemas para reduzir panes, ruídos e gastos inesperados.',
    category: 'Revisão',
    salePrice: 0,
  },
  {
    id: 'fallback-freios',
    name: 'Freios e suspensão',
    description:
      'Inspeção e reparo de componentes essenciais para conforto e segurança.',
    category: 'Segurança',
    salePrice: 0,
  },
  {
    id: 'fallback-motor',
    name: 'Motor e injeção',
    description:
      'Correção de falhas, perda de potência, consumo elevado e funcionamento irregular.',
    category: 'Mecânica geral',
    salePrice: 0,
  },
  {
    id: 'fallback-eletrica',
    name: 'Elétrica automotiva',
    description:
      'Avaliação de bateria, alternador, partida, sensores e sistemas elétricos.',
    category: 'Elétrica',
    salePrice: 0,
  },
  {
    id: 'fallback-oleo',
    name: 'Troca de óleo e filtros',
    description:
      'Manutenção básica com atenção às especificações do fabricante do veículo.',
    category: 'Manutenção',
    salePrice: 0,
  },
];

const TESTIMONIALS = [
  {
    name: 'Marcelo A.',
    text: 'Atendimento honesto e direto. Explicaram tudo antes e o preço foi justo.',
  },
  {
    name: 'Patrícia L.',
    text: 'Resolveram um problema que outras oficinas não acharam. Recomendo!',
  },
  {
    name: 'Rafael S.',
    text: 'Serviço rápido e de confiança. Meu carro voltou novo.',
  },
];

const BLOG_PLACEHOLDERS = [
  {
    title: 'Quando fazer a revisão preventiva?',
    excerpt:
      'Entenda os sinais que indicam a hora de revisar o carro antes de uma pane.',
  },
  {
    title: 'Luzes no painel: o que observar',
    excerpt:
      'Veja por que a luz de injeção, óleo ou bateria não deve ser ignorada.',
  },
  {
    title: 'Como preservar freios e suspensão',
    excerpt:
      'Cuidados simples ajudam a manter segurança, conforto e economia.',
  },
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
  const waHref = buildWhatsAppHref(s.whatsapp);
  const contactNumbers = [
    s.whatsapp
      ? { key: 'whatsapp', label: 'WhatsApp', value: s.whatsapp, href: waHref, isWhatsApp: true }
      : null,
    s.phone && !samePhoneDigits(s.phone, s.whatsapp)
      ? { key: 'phone', label: 'Telefone', value: s.phone, href: buildTelHref(s.phone), isWhatsApp: false }
      : null,
  ].filter((item): item is { key: string; label: string; value: string; href: string; isWhatsApp: boolean } => Boolean(item?.href));
  const featuredServices = data.services.length > 0 ? data.services.slice(0, 6) : FALLBACK_SERVICES;

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
            <div className="absolute inset-0 bg-gradient-to-b from-background/85 via-background/60 to-background" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-primary/15 via-background to-background" />
        )}
        <div className="container relative z-10 flex min-h-[calc(100svh-4rem)] flex-col items-center justify-center gap-6 py-16 text-center sm:min-h-0 sm:gap-7 sm:py-40">
          <span className="inline-flex items-center gap-2 rounded-full border bg-card/75 px-4 py-1.5 text-sm font-medium text-muted-foreground backdrop-blur">
            <Wrench className="size-3.5 text-primary" /> Mecânica multimarcas
          </span>
          <h1 className="max-w-4xl text-balance text-4xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
            {s.heroTitle ?? 'Cuidamos do seu carro como se fosse nosso'}
          </h1>
          <p className="max-w-3xl text-pretty text-lg leading-relaxed text-muted-foreground sm:text-xl">
            {s.heroSubtitle ??
              s.tagline ??
              'Mecânica geral multimarcas com diagnóstico preciso, peças de qualidade e atendimento honesto.'}
          </p>
          <div className="grid w-full max-w-sm gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
            <Link
              href="/site/contato"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:min-h-14 sm:px-7 sm:text-lg"
            >
              Pedir orçamento <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/site/consulta"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-background/35 px-6 py-3 text-base font-semibold shadow-sm backdrop-blur hover:bg-accent sm:min-h-14 sm:px-7 sm:text-lg"
            >
              <Search className="size-4" /> Consultar veículo
            </Link>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#25D366] px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#1fb855] sm:min-h-14 sm:px-7 sm:text-lg"
              >
                <WhatsappIcon className="size-5" />
                Chamar agora
              </a>
            )}
          </div>
          {contactNumbers.length > 0 && (
            <div className="w-full max-w-2xl rounded-2xl border bg-card/75 p-3 shadow-sm backdrop-blur sm:p-4">
              <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Fale agora
              </p>
              <div className={contactNumbers.length > 1 ? 'grid gap-2 sm:grid-cols-2' : 'grid gap-2'}>
                {contactNumbers.map((item) => (
                  <a
                    key={item.key}
                    href={item.href}
                    target={item.isWhatsApp ? '_blank' : undefined}
                    rel={item.isWhatsApp ? 'noopener noreferrer' : undefined}
                    aria-label={`${item.label}: ${maskPhone(item.value)}`}
                    className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border bg-background/80 px-4 py-3 text-lg font-bold text-foreground shadow-sm transition-colors hover:border-primary hover:bg-primary/10 sm:min-h-16 sm:text-xl"
                  >
                    {item.isWhatsApp ? (
                      <WhatsappIcon className="size-5 text-[#25D366] sm:size-6" />
                    ) : (
                      <Phone className="size-5 text-primary sm:size-6" />
                    )}
                    <span>{maskPhone(item.value)}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      <BrandMarquee />

      {/* Diferenciais */}
      <section className="container py-10 sm:py-14" id="diferenciais">
        <div className="mb-6 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight">Por que escolher a gente?</h2>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Atendimento técnico, comunicação simples e cuidado real com o seu veículo.
          </p>
        </div>
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
      <section className="container py-10 sm:py-14" id="servicos">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Nossos serviços</h2>
            <p className="text-sm text-muted-foreground sm:text-base">
              O que fazemos pelo seu veículo.
            </p>
          </div>
          <Link
            href="/site/servicos"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            Ver todos os serviços <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredServices.map((svc) => (
            <div
              key={svc.id}
              className="overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary"
            >
              {s.serviceCardImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.serviceCardImageUrl}
                  alt={svc.name}
                  className="h-40 w-full object-cover"
                />
              )}
              <div className="p-5">
                {svc.category && (
                  <span className="text-xs font-medium uppercase text-primary">
                    {svc.category}
                  </span>
                )}
                <h3 className="mt-1 font-semibold">{svc.name}</h3>
                {svc.description && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {svc.description}
                  </p>
                )}
                {svc.salePrice > 0 && (
                  <p className="mt-3 text-sm font-semibold text-primary">
                    a partir de {formatCurrency(svc.salePrice)}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sobre + horário/endereço */}
      <section className="border-y bg-muted/30" id="sobre">
        <div className="container grid gap-8 py-12 sm:py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Sobre a {s.shopName}</h2>
            <p className="mt-3 text-pretty text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {s.about ??
                'Mecânica geral multimarcas focada em diagnóstico preciso, peças de qualidade e atendimento honesto. Cuidamos do seu carro com a transparência que você merece.'}
            </p>
            <Link
              href="/site/sobre"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Saiba mais <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid gap-3 rounded-xl border bg-card p-5 text-sm sm:p-6">
            {s.hours && (
              <p className="flex min-w-0 items-start gap-3">
                <Clock className="mt-0.5 size-5 shrink-0 text-primary" />
                <span className="whitespace-pre-line break-words">{s.hours}</span>
              </p>
            )}
            {s.address && <SiteAddressLinks address={s.address} />}
            {contactNumbers.map((item) => (
              <a
                key={item.key}
                href={item.href}
                target={item.isWhatsApp ? '_blank' : undefined}
                rel={item.isWhatsApp ? 'noopener noreferrer' : undefined}
                className="flex min-w-0 items-center gap-3 hover:text-primary"
              >
                <Phone className="size-5 shrink-0 text-primary" />
                <span className="break-words">{item.label}: {maskPhone(item.value)}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Depoimentos */}
      <section className="container py-12 sm:py-16" id="depoimentos">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">
          O que dizem nossos clientes
        </h2>
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
      <section className="border-t bg-muted/30" id="blog">
        <div className="container py-12 sm:py-16">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Do nosso blog</h2>
              <p className="text-sm text-muted-foreground sm:text-base">
                Dicas rápidas para manter seu carro seguro e em dia.
              </p>
            </div>
            <Link
              href="/site/blog"
              className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Ver todos <ArrowRight className="size-4" />
            </Link>
          </div>

          {posts.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-3">
              {posts.slice(0, 3).map((p) => (
                <Link
                  key={p.slug}
                  href={`/site/blog/${p.slug}`}
                  className="group overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.imageUrl || s.blogFallbackImageUrl || BLOG_FALLBACK_IMAGE}
                    alt={p.title}
                    className="h-40 w-full object-cover"
                  />
                  <div className="p-5">
                    <h3 className="font-semibold group-hover:text-primary">{p.title}</h3>
                    {p.excerpt && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {p.excerpt}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              {BLOG_PLACEHOLDERS.map((post) => (
                <div key={post.title} className="rounded-xl border bg-card p-5">
                  <p className="text-xs font-medium uppercase text-primary">Dica da oficina</p>
                  <h3 className="mt-2 font-semibold">{post.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{post.excerpt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Chamada final */}
      <section className="container py-12 sm:py-16" id="contato">
        <div className="flex flex-col items-center gap-5 rounded-2xl border bg-gradient-to-b from-primary/10 to-card p-6 text-center sm:p-10">
          <h2 className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
            Precisa de um orçamento ou diagnóstico?
          </h2>
          <p className="max-w-lg text-sm text-muted-foreground sm:text-base">
            Fale com a gente e cuide do seu carro com quem você pode confiar.
          </p>
          <div className="grid w-full max-w-sm gap-3 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center">
            <Link
              href="/site/contato"
              className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground hover:bg-primary/90"
            >
              Pedir orçamento <ArrowRight className="size-4" />
            </Link>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-md bg-[#25D366] px-5 py-2.5 font-medium text-white hover:bg-[#1fb855]"
              >
                Falar no WhatsApp
              </a>
            )}
          </div>
        </div>
      </section>
    </>
  );
}


function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
    </svg>
  );
}
