import { cn } from '@/lib/utils';

/**
 * Indicador de carregamento temático: um pneu/roda girando.
 * Usa `currentColor`, então herda a cor do texto (ex.: text-primary).
 */
export function CarLoader({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      role="status"
      aria-label="Carregando"
      className={cn('animate-spin motion-reduce:animate-none', className)}
      style={{ animationDuration: '0.9s' }}
    >
      {/* Pneu */}
      <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="5" strokeOpacity="0.85" />
      {/* Sulcos do pneu */}
      {Array.from({ length: 12 }).map((_, i) => (
        <rect
          key={i}
          x="23"
          y="1.5"
          width="2"
          height="4"
          rx="1"
          fill="currentColor"
          transform={`rotate(${i * 30} 24 24)`}
        />
      ))}
      {/* Aro */}
      <circle cx="24" cy="24" r="10.5" fill="none" stroke="currentColor" strokeWidth="3" />
      {/* Raios */}
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={i}
          x1="24"
          y1="24"
          x2="24"
          y2="13.5"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${i * 72} 24 24)`}
        />
      ))}
      {/* Cubo central */}
      <circle cx="24" cy="24" r="3.2" fill="currentColor" />
    </svg>
  );
}
