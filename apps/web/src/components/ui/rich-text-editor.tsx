'use client';

import { useEffect, useRef } from 'react';
import { Bold, Italic, Underline, List, ListOrdered, Eraser } from 'lucide-react';
import { cn } from '@/lib/utils';

type Cmd = {
  icon: typeof Bold;
  command: string;
  label: string;
};

const COMMANDS: Cmd[] = [
  { icon: Bold, command: 'bold', label: 'Negrito' },
  { icon: Italic, command: 'italic', label: 'Itálico' },
  { icon: Underline, command: 'underline', label: 'Sublinhado' },
  { icon: List, command: 'insertUnorderedList', label: 'Lista' },
  { icon: ListOrdered, command: 'insertOrderedList', label: 'Lista numerada' },
  { icon: Eraser, command: 'removeFormat', label: 'Limpar formatação' },
];

/**
 * Editor rich text mínimo (negrito, itálico, sublinhado e listas) sobre um
 * contentEditable. Emite HTML simples em onChange — pensado para o rodapé do PDF.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sincroniza o conteúdo só quando vem de fora diferente do DOM atual
  // (carga inicial / reset), preservando o cursor durante a digitação.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== (value || '')) {
      el.innerHTML = value || '';
    }
  }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? '');

  const run = (command: string) => {
    // Garante saída em tags (<b>/<i>/<u>) em vez de style inline.
    document.execCommand('styleWithCSS', false, 'false');
    document.execCommand(command, false);
    ref.current?.focus();
    emit();
  };

  return (
    <div className="rounded-md border border-input bg-background">
      <div className="flex flex-wrap gap-0.5 border-b p-1">
        {COMMANDS.map(({ icon: Icon, command, label }) => (
          <button
            key={command}
            type="button"
            title={label}
            aria-label={label}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(command)}
            className="grid size-7 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Icon className="size-4" />
          </button>
        ))}
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        onInput={emit}
        onBlur={emit}
        data-placeholder={placeholder}
        className={cn(
          'min-h-[150px] px-3 py-2 text-sm leading-relaxed outline-none',
          '[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-5 [&_ol]:pl-5',
          '[&:empty]:before:pointer-events-none [&:empty]:before:text-muted-foreground [&:empty]:before:content-[attr(data-placeholder)]',
        )}
      />
    </div>
  );
}
