'use client';

import { useEffect, useState } from 'react';

/**
 * Acompanha uma media query CSS. Retorna `false` no primeiro render (SSR e antes
 * de hidratar) e atualiza no cliente. Útil para escolher layouts distintos por
 * breakpoint renderizando cada componente uma única vez (sem duplicar a árvore).
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/** `true` quando a viewport tem largura de desktop (>= 1024px, breakpoint lg). */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)');
}
