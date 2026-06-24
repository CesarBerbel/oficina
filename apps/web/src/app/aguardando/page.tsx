import { redirect } from 'next/navigation';
import { Wrench, Clock } from 'lucide-react';
import { getLoginContext } from '@/lib/public-api';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Aguardando aprovação: o subdomínio livre já tem um pedido de criação de conta
 * pendente. Para onde redirecionamos em vez de mostrar o cadastro de novo.
 *
 * Guarda o acesso direto: só mostra a tela quando de fato há um pedido pendente
 * para este host; senão segue o mesmo roteamento por host das demais páginas.
 */
export default async function AguardandoPage() {
  const ctx = await getLoginContext();
  // Conta já existe (pedido aprovado) → site da oficina.
  if (ctx?.account) redirect('/site');
  if (!ctx?.pendingRequest) {
    // Subdomínio livre sem pedido → cadastro; qualquer outro host → home.
    redirect(ctx?.suggestedSlug ? `/comecar?slug=${encodeURIComponent(ctx.suggestedSlug)}` : '/');
  }
  return (
    <main className="min-h-dvh bg-muted/40">
      <header className="border-b bg-card">
        <div className="container flex items-center justify-between py-4">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wrench className="size-4" />
            </span>
            Oficina
          </span>
        </div>
      </header>

      <section className="container flex min-h-[60vh] items-center justify-center py-12">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-xl border bg-card p-8 text-center shadow-sm">
          <span className="flex size-14 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Clock className="size-7" />
          </span>
          <h1 className="text-xl font-semibold">Pedido em análise</h1>
          <p className="text-sm text-muted-foreground">
            Já recebemos o seu pedido para criar esta oficina e ele está aguardando aprovação.
            Entraremos em contato pelo e-mail informado assim que a sua conta for liberada.
          </p>
        </div>
      </section>
    </main>
  );
}
