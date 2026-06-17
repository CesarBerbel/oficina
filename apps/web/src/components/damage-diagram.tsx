'use client';

import { Trash2 } from 'lucide-react';
import {
  DAMAGE_SEVERITIES,
  DAMAGE_SEVERITY_LABELS,
  DamageSeverity,
  type DamagePoint,
} from '@oficina/shared';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const SEVERITY_COLOR: Record<DamageSeverity, string> = {
  LEVE: '#eab308',
  MODERADO: '#f97316',
  GRAVE: '#ef4444',
};

/**
 * Diagrama de avarias: clique sobre a silhueta (vista superior) para marcar um
 * ponto. Cada ponto recebe gravidade e descrição editáveis na lista abaixo.
 */
export function DamageDiagram({
  value,
  onChange,
}: {
  value: DamagePoint[];
  onChange: (points: DamagePoint[]) => void;
}) {
  function addPoint(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    onChange([...value, { x, y, severity: DamageSeverity.LEVE, description: '' }]);
  }

  function update(i: number, patch: Partial<DamagePoint>) {
    onChange(value.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  }

  function remove(i: number) {
    onChange(value.filter((_, idx) => idx !== i));
  }

  return (
    <div className="space-y-3">
      <div
        onClick={addPoint}
        className="relative mx-auto aspect-[5/2] w-full max-w-md cursor-crosshair rounded-xl border bg-muted/40"
        title="Clique para marcar uma avaria"
      >
        {/* Silhueta simplificada (vista superior) */}
        <svg viewBox="0 0 500 200" className="pointer-events-none h-full w-full">
          <rect
            x="60"
            y="35"
            width="380"
            height="130"
            rx="55"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground/50"
          />
          <rect
            x="150"
            y="60"
            width="200"
            height="80"
            rx="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground/40"
          />
          <line
            x1="250"
            y1="35"
            x2="250"
            y2="165"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="4 4"
            className="text-muted-foreground/30"
          />
        </svg>
        {value.map((p, i) => (
          <span
            key={i}
            className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow"
            style={{
              left: `${p.x * 100}%`,
              top: `${p.y * 100}%`,
              backgroundColor: SEVERITY_COLOR[p.severity],
            }}
          >
            {i + 1}
          </span>
        ))}
      </div>

      {value.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          Nenhuma avaria marcada. Clique no diagrama para registrar.
        </p>
      ) : (
        <ul className="space-y-2">
          {value.map((p, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span
                className="flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: SEVERITY_COLOR[p.severity] }}
              >
                {i + 1}
              </span>
              <Select
                className="w-32"
                value={p.severity}
                onChange={(e) => update(i, { severity: e.target.value as DamageSeverity })}
              >
                {DAMAGE_SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {DAMAGE_SEVERITY_LABELS[s]}
                  </option>
                ))}
              </Select>
              <Input
                className="min-w-40 flex-1"
                placeholder="Descrição da avaria"
                value={p.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => remove(i)}
                aria-label="Remover avaria"
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
