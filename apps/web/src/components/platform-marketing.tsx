import Link from 'next/link';
import {
  Wrench,
  ArrowRight,
  Globe,
  ShieldCheck,
  Rocket,
  ClipboardList,
  Package,
  CircleDollarSign,
  Check,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Globe,
    title: 'Site próprio',
    text: 'Sua oficina online no seu endereço, com a sua marca.',
  },
  {
    icon: ClipboardList,
    title: 'Ordens de serviço',
    text: 'Orçamentos, aprovação do cliente e acompanhamento.',
  },
  { icon: Package, title: 'Estoque', text: 'Peças, entradas/saídas e alertas de mínimo.' },
  { icon: CircleDollarSign, title: 'Financeiro', text: 'Contas a pagar/receber e fluxo de caixa.' },
  {
    icon: ShieldCheck,
    title: 'Dados isolados',
    text: 'Cada oficina com seus dados, separados e seguros.',
  },
  { icon: Rocket, title: 'Pronto na hora', text: 'Sua conta no ar em minutos, sem instalar nada.' },
];

const STEPS = [
  { n: '1', title: 'Peça sua oficina', text: 'Escolha o endereço (subdomínio) e envie o pedido.' },
  {
    n: '2',
    title: 'Liberação',
    text: 'Aprovamos e criamos sua conta com acesso de administrador.',
  },
  { n: '3', title: 'Comece a usar', text: 'Entre, configure o site e gerencie a oficina.' },
];

/** Site institucional da PLATAFORMA (apex) — vende o sistema para oficinas. */
export function PlatformMarketing() {
  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b bg-card/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </span>
            Oficina<span className="text-muted-foreground">SaaS</span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Entrar
            </Link>
            <Link
              href="/comecar"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Criar minha oficina
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b bg-gradient-to-b from-primary/10 to-background">
          <div className="container flex flex-col items-center gap-6 py-20 text-center sm:py-28">
            <span className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground">
              <Wrench className="size-3.5 text-primary" /> Plataforma para oficinas mecânicas
            </span>
            <h1 className="max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
              Site e sistema completo para a sua oficina
            </h1>
            <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
              Tenha um site profissional no seu endereço e gerencie tudo num lugar só: ordens de
              serviço, orçamentos, estoque, financeiro e CRM. Pronto em minutos.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/comecar"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
              >
                Criar minha oficina <ArrowRight className="size-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border bg-card px-7 py-3 text-base font-semibold hover:bg-accent"
              >
                Já sou cliente
              </Link>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section className="container py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
            Tudo que a sua oficina precisa
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-xl border bg-card p-5">
                <span className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </span>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section className="border-y bg-muted/30">
          <div className="container py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight sm:text-3xl">
              Como funciona
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-xl border bg-card p-6">
                  <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                    {s.n}
                  </span>
                  <h3 className="mt-3 font-semibold">{s.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="container py-16">
          <div className="flex flex-col items-center gap-5 rounded-2xl border bg-gradient-to-b from-primary/10 to-card p-8 text-center sm:p-12">
            <h2 className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
              Coloque a sua oficina online hoje
            </h2>
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <Check className="size-4 text-primary" /> Sem instalar nada
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="size-4 text-primary" /> Site + gestão juntos
              </li>
              <li className="flex items-center gap-1.5">
                <Check className="size-4 text-primary" /> No seu endereço
              </li>
            </ul>
            <Link
              href="/comecar"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-7 py-3 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Criar minha oficina <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container py-6 text-center text-xs text-muted-foreground">
          © OficinaSaaS — plataforma de sites e gestão para oficinas.
        </div>
      </footer>
    </div>
  );
}
