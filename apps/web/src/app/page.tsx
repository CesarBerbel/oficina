import Link from 'next/link';
import { Wrench, ArrowRight, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-background to-muted/40">
      <header className="container flex items-center justify-between py-6">
        <div className="flex items-center gap-2 font-semibold">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="size-5" />
          </span>
          Oficina
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/login">Entrar</Link>
        </Button>
      </header>

      <section className="container flex flex-col items-center gap-6 py-20 text-center">
        <span className="rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
          Fundação · Fase 0 concluída
        </span>
        <h1 className="max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Gestão completa para sua oficina mecânica
        </h1>
        <p className="max-w-xl text-pretty text-muted-foreground">
          Clientes, veículos, ordens de serviço, orçamentos, estoque e muito
          mais — moderno, rápido e pronto para crescer como SaaS.
        </p>
        <div className="flex gap-3">
          <Button asChild>
            <Link href="/login">
              Acessar o sistema <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="container grid gap-4 pb-20 sm:grid-cols-3">
        {[
          {
            icon: LayoutDashboard,
            title: 'Operação centralizada',
            text: 'Dashboard, central de ações e kanban técnico.',
          },
          {
            icon: Wrench,
            title: 'Ordens de Serviço',
            text: 'Fluxo completo com timeline, orçamento e PDF.',
          },
          {
            icon: ShieldCheck,
            title: 'Seguro por padrão',
            text: 'Perfis, permissões e auditoria de ponta a ponta.',
          },
        ].map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border bg-card p-5">
            <Icon className="mb-3 size-6 text-primary" />
            <h3 className="font-medium">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
