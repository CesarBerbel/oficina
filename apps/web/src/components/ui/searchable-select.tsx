'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableOption {
  value: string;
  label: string;
  /** Texto extra considerado na busca (ex.: placa, código). */
  keywords?: string;
}

type PanelPosition = {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
};

/**
 * Select com busca (dropdown padrão com pesquisa).
 *
 * Em páginas comuns, o painel é renderizado inline, como no fluxo de OS.
 * Dentro de Dialog, o painel é renderizado em uma camada absoluta própria do
 * modal. Assim ele continua ancorado no campo, aceita foco no input e não
 * aumenta o scroll do conteúdo maior da modal.
 */
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  disabled,
  className,
  emptyText = 'Nenhum resultado',
}: {
  value: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [portalLayer, setPortalLayer] = React.useState<HTMLElement | null>(null);
  const [panelPosition, setPanelPosition] = React.useState<PanelPosition | null>(
    null,
  );

  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.keywords ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  const updatePanelPosition = React.useCallback(() => {
    if (!open || !triggerRef.current || !portalLayer) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const layerRect = portalLayer.getBoundingClientRect();
    const gap = 4;
    const preferredHeight = 256;
    const viewportMargin = 12;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const spaceBelow = viewportHeight - triggerRect.bottom - viewportMargin;
    const spaceAbove = triggerRect.top - viewportMargin;
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      140,
      Math.min(preferredHeight, openUp ? spaceAbove - gap : spaceBelow - gap),
    );

    setPanelPosition({
      left: triggerRect.left - layerRect.left,
      top: openUp
        ? triggerRect.top - layerRect.top - maxHeight - gap
        : triggerRect.bottom - layerRect.top + gap,
      width: triggerRect.width,
      maxHeight,
    });
  }, [open, portalLayer]);

  React.useLayoutEffect(() => {
    const layer = rootRef.current
      ?.closest('[data-dialog-content="true"]')
      ?.querySelector<HTMLElement>('[data-searchable-select-layer="true"]');

    setPortalLayer(layer ?? null);
  }, []);

  React.useLayoutEffect(() => {
    updatePanelPosition();
  }, [updatePanelPosition, query, filtered.length]);

  React.useEffect(() => {
    if (!open) return;

    function onDocPointer(e: PointerEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    }

    function onReposition() {
      updatePanelPosition();
    }

    document.addEventListener('pointerdown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      document.removeEventListener('pointerdown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updatePanelPosition]);

  React.useEffect(() => {
    if (!open) return;

    setQuery('');
    const focusInput = () => inputRef.current?.focus({ preventScroll: true });
    const raf = window.requestAnimationFrame(() => {
      updatePanelPosition();
      focusInput();
    });
    const timer = window.setTimeout(focusInput, 0);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [open, updatePanelPosition]);

  function toggle() {
    if (disabled) return;
    setOpen((isOpen) => !isOpen);
  }

  function pick(nextValue: string) {
    onChange(nextValue);
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

  const panel = (
    <div
      ref={panelRef}
      data-searchable-select-panel="true"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      className={cn(
        'pointer-events-auto z-[9999] overflow-hidden rounded-md border bg-card text-card-foreground shadow-xl',
        portalLayer ? 'absolute' : 'absolute left-0 top-full mt-1 w-full',
      )}
      style={
        portalLayer && panelPosition
          ? {
              left: panelPosition.left,
              top: panelPosition.top,
              width: panelPosition.width,
            }
          : undefined
      }
    >
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 text-muted-foreground" />
        <input
          ref={inputRef}
          value={query}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar..."
          autoComplete="off"
          className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <ul
        role="listbox"
        className="overflow-y-auto p-1"
        style={{ maxHeight: portalLayer ? panelPosition?.maxHeight ?? 256 : 256 }}
      >
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {emptyText}
          </li>
        ) : (
          filtered.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => pick(option.value)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground',
                  option.value === value && 'bg-accent/50',
                )}
              >
                <Check
                  className={cn(
                    'size-4 shrink-0',
                    option.value === value ? 'opacity-100' : 'opacity-0',
                  )}
                />
                <span className="flex-1">{option.label}</span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={toggle}
        className="flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open && (portalLayer ? createPortal(panel, portalLayer) : panel)}
    </div>
  );
}
