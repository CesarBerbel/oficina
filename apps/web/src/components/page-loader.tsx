import { CarLoader } from '@/components/car-loader';
import { cn } from '@/lib/utils';

/** Tela de carregamento de página (fallback de navegação). */
export function PageLoader({ className }: { className?: string }) {
  return (
    <div className={cn('grid min-h-[60vh] w-full place-items-center', className)}>
      <div className="flex flex-col items-center gap-3">
        <CarLoader size={56} className="text-primary" />
        <p className="text-sm text-muted-foreground">Carregando…</p>
      </div>
    </div>
  );
}
