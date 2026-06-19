import { redirect } from 'next/navigation';
import { getLoginContext } from '@/lib/public-api';
import { PlatformMarketing } from '@/components/platform-marketing';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Raiz do domínio, decidida pelo host:
 * - conta (subdomínio/domínio próprio) → site da oficina (/site);
 * - subdomínio livre (sem oficina) → cadastro com o slug preenchido;
 * - apex da plataforma / dev → site institucional da plataforma.
 */
export default async function HomePage() {
  const ctx = await getLoginContext();
  if (ctx?.account) redirect('/site');
  if (ctx?.suggestedSlug) redirect(`/comecar?slug=${encodeURIComponent(ctx.suggestedSlug)}`);
  return <PlatformMarketing />;
}
