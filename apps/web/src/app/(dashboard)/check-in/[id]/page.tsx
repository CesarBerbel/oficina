'use client';

import { use } from 'react';
import Link from 'next/link';
import { FileDown } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  CHECKLIST_STATUS_LABELS,
  ChecklistStatus,
  DAMAGE_SEVERITY_LABELS,
  DamageSeverity,
  FUEL_LEVEL_LABELS,
  type FuelLevel,
} from '@oficina/shared';
import { openAuthedResource } from '@/lib/api';
import { useCheckin } from '@/features/checkins/use-checkins';
import { Button } from '@/components/ui/button';
import { BackButton } from '@/components/back-button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const STATUS_BADGE: Record<ChecklistStatus, string> = {
  OK: 'bg-emerald-100 text-emerald-700',
  ATENCAO: 'bg-amber-100 text-amber-700',
  FALHA: 'bg-red-100 text-red-700',
  NA: 'bg-muted text-muted-foreground',
};

const SEVERITY_COLOR: Record<DamageSeverity, string> = {
  LEVE: '#eab308',
  MODERADO: '#f97316',
  GRAVE: '#ef4444',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function CheckinDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: c, isLoading, isError } = useCheckin(id);

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError || !c) {
    return (
      <div className="space-y-4">
        <BackButton fallbackHref="/check-in" />
        <p className="text-muted-foreground">Check-in não encontrado.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-10">
      <div className="flex items-center gap-3">
        <BackButton fallbackHref="/check-in" iconOnly />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {c.vehiclePlate}
            </Badge>
            <h1 className="text-2xl font-bold tracking-tight">{c.vehicleLabel}</h1>
          </div>
          <p className="text-muted-foreground">
            {c.customerName} · {formatDate(c.createdAt)}
            {c.createdByName ? ` · por ${c.createdByName}` : ''}
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            openAuthedResource(`/checkins/${c.id}/pdf`).catch(() =>
              toast.error('Erro ao gerar o PDF'),
            )
          }
        >
          <FileDown className="size-4" /> Gerar PDF
        </Button>
        {c.serviceOrderNumber && (
          <Button variant="outline" asChild>
            <Link
              href={`/os/${c.serviceOrderId}?returnTo=${encodeURIComponent(`/check-in/${c.id}`)}`}
            >
              OS #{c.serviceOrderNumber}
            </Link>
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado no recebimento</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <Info label="Quilometragem">
            {c.km != null ? `${c.km.toLocaleString('pt-BR')} km` : '—'}
          </Info>
          <Info label="Combustível">
            {c.fuelLevel ? FUEL_LEVEL_LABELS[c.fuelLevel as FuelLevel] : '—'}
          </Info>
          <Info label="Responsável">{c.signedBy ?? '—'}</Info>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1.5">
          {c.checklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem itens.</p>
          ) : (
            c.checklist.map((it, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-2 border-b py-1.5 text-sm last:border-0"
              >
                <span>
                  {it.item}
                  {it.note && <span className="text-muted-foreground"> — {it.note}</span>}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[it.status as ChecklistStatus]}`}
                >
                  {CHECKLIST_STATUS_LABELS[it.status as ChecklistStatus]}
                </span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {c.damages.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Avarias</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative mx-auto aspect-[5/2] w-full max-w-md rounded-xl border bg-muted/40">
              <svg viewBox="0 0 500 200" className="h-full w-full">
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
              </svg>
              {c.damages.map((p, i) => (
                <span
                  key={i}
                  className="absolute flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-bold text-white shadow"
                  style={{
                    left: `${p.x * 100}%`,
                    top: `${p.y * 100}%`,
                    backgroundColor: SEVERITY_COLOR[p.severity as DamageSeverity],
                  }}
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <ul className="space-y-1 text-sm">
              {c.damages.map((p, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: SEVERITY_COLOR[p.severity as DamageSeverity] }}
                  >
                    {i + 1}
                  </span>
                  <span className="font-medium">
                    {DAMAGE_SEVERITY_LABELS[p.severity as DamageSeverity]}
                  </span>
                  <span className="text-muted-foreground">{p.description}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {c.photos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Fotos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {c.photos.map((url) => (
                <a key={url} href={url} target="_blank" rel="noreferrer" className="aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Foto do veículo"
                    className="h-full w-full rounded-lg border object-cover"
                  />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(c.notes || c.signatureUrl) && (
        <Card>
          <CardHeader>
            <CardTitle>Observações e assinatura</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {c.notes && <p className="whitespace-pre-wrap text-sm">{c.notes}</p>}
            {c.signatureUrl && (
              <div>
                <p className="mb-1 text-xs text-muted-foreground">
                  Assinatura {c.signedBy ? `— ${c.signedBy}` : ''}
                </p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={c.signatureUrl}
                  alt="Assinatura"
                  className="h-28 rounded-lg border bg-white object-contain"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{children}</p>
    </div>
  );
}
