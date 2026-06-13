const BRANDS = [
  { key: 'volkswagen', name: 'Volkswagen' },
  { key: 'fiat', name: 'Fiat' },
  { key: 'chevrolet', name: 'Chevrolet' },
  { key: 'toyota', name: 'Toyota' },
  { key: 'honda', name: 'Honda' },
  { key: 'hyundai', name: 'Hyundai' },
  { key: 'ford', name: 'Ford' },
  { key: 'renault', name: 'Renault' },
  { key: 'jeep', name: 'Jeep' },
  { key: 'nissan', name: 'Nissan' },
] as const;

type Brand = (typeof BRANDS)[number];

function BrandLogo({ brand }: { brand: Brand }) {
  switch (brand.key) {
    case 'volkswagen':
      return (
        <svg viewBox="0 0 72 72" aria-hidden="true" className="size-11 text-foreground">
          <circle cx="36" cy="36" r="31" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <path d="M19 22l8.2 24L36 28.5 44.8 46 53 22" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M24 49.5h24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        </svg>
      );
    case 'fiat':
      return (
        <svg viewBox="0 0 120 72" aria-hidden="true" className="h-11 w-20 text-foreground">
          <rect x="6" y="12" width="108" height="48" rx="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <text x="60" y="45" textAnchor="middle" fontSize="28" fontWeight="700" fill="currentColor" letterSpacing="5">
            FIAT
          </text>
        </svg>
      );
    case 'chevrolet':
      return (
        <svg viewBox="0 0 120 72" aria-hidden="true" className="h-11 w-20 text-foreground">
          <path
            d="M8 29h28l8-10h32l8 10h28v14H84l-8 10H44l-8-10H8z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'toyota':
      return (
        <svg viewBox="0 0 92 72" aria-hidden="true" className="h-11 w-16 text-foreground">
          <ellipse cx="46" cy="36" rx="32" ry="20" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <ellipse cx="46" cy="36" rx="10" ry="20" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <ellipse cx="46" cy="36" rx="20" ry="10" fill="none" stroke="currentColor" strokeWidth="3.5" />
        </svg>
      );
    case 'honda':
      return (
        <svg viewBox="0 0 72 72" aria-hidden="true" className="size-11 text-foreground">
          <rect x="10" y="8" width="52" height="56" rx="10" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <path d="M24 20v32M48 20v32M24 36h24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        </svg>
      );
    case 'hyundai':
      return (
        <svg viewBox="0 0 108 72" aria-hidden="true" className="h-11 w-[4.5rem] text-foreground">
          <ellipse cx="54" cy="36" rx="38" ry="22" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <path d="M38 48l6-24m20 24l-6-24M44 36h14" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'ford':
      return (
        <svg viewBox="0 0 112 72" aria-hidden="true" className="h-11 w-20 text-foreground">
          <ellipse cx="56" cy="36" rx="44" ry="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <text x="56" y="43" textAnchor="middle" fontSize="24" fontStyle="italic" fontWeight="700" fill="currentColor">
            Ford
          </text>
        </svg>
      );
    case 'renault':
      return (
        <svg viewBox="0 0 72 72" aria-hidden="true" className="size-11 text-foreground">
          <path d="M36 8l16 28-16 28-16-28z" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
          <path d="M36 22l8 14-8 14-8-14z" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        </svg>
      );
    case 'jeep':
      return (
        <svg viewBox="0 0 120 72" aria-hidden="true" className="h-11 w-20 text-foreground">
          <text x="60" y="44" textAnchor="middle" fontSize="26" fontWeight="800" fill="currentColor" letterSpacing="1.5">
            JEEP
          </text>
        </svg>
      );
    case 'nissan':
      return (
        <svg viewBox="0 0 92 72" aria-hidden="true" className="h-11 w-16 text-foreground">
          <circle cx="46" cy="36" r="24" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <rect x="18" y="29" width="56" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <text x="46" y="39" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" letterSpacing="1.5">
            NISSAN
          </text>
        </svg>
      );
    default:
      return null;
  }
}

function BrandCard({ brand }: { brand: Brand }) {
  return (
    <div className="flex h-24 w-[10.5rem] shrink-0 items-center justify-center gap-3 rounded-2xl border bg-card/80 px-5 backdrop-blur-sm transition-colors hover:border-primary/60 hover:bg-card">
      <BrandLogo brand={brand} />
      <span className="text-sm font-medium tracking-wide text-muted-foreground">{brand.name}</span>
    </div>
  );
}

export function BrandMarquee() {
  const repeatedBrands = [...BRANDS, ...BRANDS];

  return (
    <section className="border-b bg-background/95">
      <div className="container py-8 sm:py-10">
        <div className="mb-5 flex flex-col gap-1 text-center sm:mb-6">
          <span className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Multimarcas
          </span>
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            Trabalhamos com as principais marcas de carros
          </h2>
          <p className="text-sm text-muted-foreground">
            Diagnóstico, revisão e manutenção com experiência em veículos nacionais e importados.
          </p>
        </div>

        <div className="group relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />

          <div className="flex w-max gap-4 animate-brand-marquee group-hover:[animation-play-state:paused]">
            {repeatedBrands.map((brand, index) => (
              <BrandCard key={`${brand.key}-${index}`} brand={brand} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
