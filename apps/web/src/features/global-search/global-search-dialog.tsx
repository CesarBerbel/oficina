'use client';

import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Car,
  ClipboardList,
  Inbox,
  Package,
  Search,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import {
  GLOBAL_SEARCH_ENTITY_LABELS,
  GlobalSearchEntityType,
  type GlobalSearchResultDto,
} from '@oficina/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useGlobalSearch } from './use-global-search';

const ICONS = {
  [GlobalSearchEntityType.CUSTOMER]: Users,
  [GlobalSearchEntityType.VEHICLE]: Car,
  [GlobalSearchEntityType.SERVICE_ORDER]: ClipboardList,
  [GlobalSearchEntityType.LEAD]: Inbox,
  [GlobalSearchEntityType.PART]: Package,
  [GlobalSearchEntityType.SERVICE]: Wrench,
} satisfies Record<GlobalSearchEntityType, LucideIcon>;

function ResultItem({
  result,
  active,
  onSelect,
}: {
  result: GlobalSearchResultDto;
  active: boolean;
  onSelect: () => void;
}) {
  const Icon = ICONS[result.type];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/10' : 'hover:bg-accent',
      )}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{result.title}</span>
          <Badge variant="outline" className="shrink-0">
            {GLOBAL_SEARCH_ENTITY_LABELS[result.type]}
          </Badge>
          {result.badge ? (
            <Badge variant="secondary" className="shrink-0">
              {result.badge}
            </Badge>
          ) : null}
        </span>
        {result.subtitle ? (
          <span className="block truncate text-sm text-muted-foreground">{result.subtitle}</span>
        ) : null}
        {result.description ? (
          <span className="line-clamp-2 block text-xs text-muted-foreground">
            {result.description}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export function GlobalSearchDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const search = useGlobalSearch(query, open);

  const results = useMemo(() => search.data?.results ?? [], [search.data?.results]);

  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
        return;
      }

      if (!isTyping && event.key === '/') {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
    setActiveIndex(0);
  }

  function select(result: GlobalSearchResultDto | undefined) {
    if (!result) return;
    close();
    router.push(result.href);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) =>
        results.length === 0 ? 0 : Math.min(current + 1, results.length - 1),
      );
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      select(results[activeIndex]);
    }
  }

  const trimmed = query.trim();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-9 w-64 justify-start gap-2 text-muted-foreground md:flex"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Buscar cliente, placa, OS...</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          Ctrl K
        </kbd>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Busca global"
        onClick={() => setOpen(true)}
      >
        <Search className="size-5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl overflow-y-auto p-4 sm:p-5">
          <DialogHeader className="pr-8">
            <DialogTitle>Busca global inteligente</DialogTitle>
            <DialogDescription>
              Encontre clientes, placas, OS, atendimentos, peças e serviços em um só lugar.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="Digite nome, telefone, placa, número da OS, peça..."
              className="h-12 pl-10 text-base"
            />
          </div>

          <div className="min-h-48 space-y-2">
            {trimmed.length < 2 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Digite pelo menos 2 caracteres. Dicas: use placa, nome do cliente, telefone, número
                da OS, código da peça ou serviço.
              </div>
            ) : search.isLoading ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Buscando em todos os módulos...
              </div>
            ) : search.isError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-6 text-sm text-destructive">
                Não foi possível executar a busca agora.
              </div>
            ) : results.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                Nenhum resultado encontrado para “{trimmed}”.
              </div>
            ) : (
              results.map((result, index) => (
                <ResultItem
                  key={`${result.type}-${result.id}`}
                  result={result}
                  active={index === activeIndex}
                  onSelect={() => select(result)}
                />
              ))
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <kbd className="rounded border bg-muted px-1.5 py-0.5">↑</kbd>
            <kbd className="rounded border bg-muted px-1.5 py-0.5">↓</kbd>
            navegar
            <kbd className="rounded border bg-muted px-1.5 py-0.5">Enter</kbd>
            abrir
            <kbd className="rounded border bg-muted px-1.5 py-0.5">Esc</kbd>
            fechar
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
