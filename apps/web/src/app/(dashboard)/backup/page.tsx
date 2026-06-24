'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  DatabaseBackup,
  ShieldAlert,
  Download,
  HardDrive,
  Database,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { useBackupStatus, downloadBackup } from '@/features/platform/use-backup';
import { ApiError } from '@/lib/api';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function BackupPage() {
  const { user } = useAuth();
  const { data: status, isLoading, isFetching, refetch } = useBackupStatus();
  const [downloading, setDownloading] = useState(false);

  if (!user?.platformAdmin) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ShieldAlert className="mx-auto mb-3 size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Acesso restrito</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta área é exclusiva do administrador da plataforma.
        </p>
      </div>
    );
  }

  async function onDownload() {
    setDownloading(true);
    const toastId = toast.loading('Gerando backup… isso pode levar alguns instantes.');
    try {
      await downloadBackup();
      toast.success('Backup gerado. O download deve começar automaticamente.', { id: toastId });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao gerar o backup.', {
        id: toastId,
      });
    } finally {
      setDownloading(false);
    }
  }

  const hb = status?.heartbeat;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <DatabaseBackup className="size-6 text-primary" /> Backup
          </h1>
          <p className="text-muted-foreground">
            Gere um backup completo (banco de dados + arquivos enviados) e baixe num único arquivo
            .zip. Guarde-o em local seguro, fora deste servidor.
          </p>
        </div>
        <Button variant="outline" size="sm" disabled={isFetching} onClick={() => void refetch()}>
          <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* Último backup agendado (heartbeat do cron). */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground">Último backup agendado</h2>
        {isLoading ? (
          <div className="py-2">
            <CarLoader className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : hb?.lastAt ? (
          <div className="mt-2 flex items-center gap-2">
            {hb.ok ? (
              <CheckCircle2 className="size-5 text-emerald-600" />
            ) : (
              <AlertTriangle className="size-5 text-amber-600" />
            )}
            <div>
              <p className="font-medium">{formatDateTime(hb.lastAt)}</p>
              <p className="text-xs text-muted-foreground">
                {hb.ageHours != null ? `Há ${hb.ageHours}h` : ''} · limite de alerta:{' '}
                {hb.maxAgeHours}h
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center gap-2 text-amber-700">
            <AlertTriangle className="size-5" />
            <p className="text-sm">
              Nenhum backup agendado registrado ainda. O backup automático (cron) grava esse
              registro; use o botão abaixo para um backup manual a qualquer momento.
            </p>
          </div>
        )}
      </section>

      {/* O que será incluído. */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Database className="size-4" />
            <span className="text-xs font-medium uppercase">Banco de dados</span>
          </div>
          <p className="mt-2 text-xl font-semibold">
            {isLoading ? '—' : formatBytes(status?.dbSizeBytes ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? '' : `${status?.tableCount ?? 0} tabelas`}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ImageIcon className="size-4" />
            <span className="text-xs font-medium uppercase">Uploads</span>
          </div>
          <p className="mt-2 text-xl font-semibold">
            {isLoading ? '—' : formatBytes(status?.uploads.sizeBytes ?? 0)}
          </p>
          <p className="text-xs text-muted-foreground">
            {isLoading ? '' : `${status?.uploads.fileCount ?? 0} arquivo(s)`}
          </p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HardDrive className="size-4" />
            <span className="text-xs font-medium uppercase">Total estimado</span>
          </div>
          <p className="mt-2 text-xl font-semibold">
            {isLoading
              ? '—'
              : formatBytes((status?.dbSizeBytes ?? 0) + (status?.uploads.sizeBytes ?? 0))}
          </p>
          <p className="text-xs text-muted-foreground">antes da compactação</p>
        </div>
      </section>

      {/* Ação. */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Backup manual</h2>
            <p className="text-sm text-muted-foreground">
              Lê todas as tabelas num snapshot consistente e empacota com os uploads.
            </p>
          </div>
          <Button onClick={() => void onDownload()} disabled={downloading || isLoading}>
            {downloading ? (
              <>
                <CarLoader className="size-4 animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <Download className="size-4" /> Gerar e baixar backup
              </>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
