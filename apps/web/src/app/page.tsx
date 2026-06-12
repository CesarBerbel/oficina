import { redirect } from 'next/navigation';

/** A raiz do domínio mostra o site público (rota /site). */
export default function HomePage() {
  redirect('/site');
}
