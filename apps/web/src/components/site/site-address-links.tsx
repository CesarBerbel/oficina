import { MapPin, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';

type SiteAddressLinksProps = {
  address: string;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
  showIcon?: boolean;
  showMobileButtons?: boolean;
};

function getMapLinks(address: string) {
  const query = encodeURIComponent(address.trim());

  return {
    googleMapsHref: `https://www.google.com/maps/search/?api=1&query=${query}`,
    wazeHref: `https://waze.com/ul?q=${query}&navigate=yes`,
  };
}

export function SiteAddressLinks({
  address,
  className,
  iconClassName,
  textClassName,
  showIcon = true,
  showMobileButtons = true,
}: SiteAddressLinksProps) {
  const { googleMapsHref, wazeHref } = getMapLinks(address);

  return (
    <div className={cn('min-w-0', className)}>
      <a
        href={googleMapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex min-w-0 items-start gap-3 hover:text-primary"
        aria-label={`Abrir endereço no Google Maps: ${address}`}
      >
        {showIcon && (
          <MapPin className={cn('mt-0.5 size-5 shrink-0 text-primary', iconClassName)} />
        )}
        <span className={cn('break-words underline-offset-4 group-hover:underline', textClassName)}>
          {address}
        </span>
      </a>

      {showMobileButtons && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:hidden">
          <a
            href={googleMapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <MapPin className="size-3.5" /> Google Maps
          </a>
          <a
            href={wazeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-md border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-accent"
          >
            <Navigation className="size-3.5" /> Waze
          </a>
        </div>
      )}
    </div>
  );
}
