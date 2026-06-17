'use client';

import { useState } from 'react';

import { CarLoader } from '@/components/car-loader';
import { useAudit } from '@/features/settings/use-settings';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export default function AuditPage() {
  const [moduleF, setModuleF] = useState('');
  const [actionF, setActionF] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAudit({
    page,
    pageSize: 20,
    module: moduleF || undefined,
    action: actionF || undefined,
  });
  const rows = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-muted-foreground">Histórico de eventos e alterações importantes.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Filtrar por módulo (ex.: service-orders)"
          value={moduleF}
          onChange={(e) => {
            setModuleF(e.target.value);
            setPage(1);
          }}
          className="sm:w-64"
        />
        <Input
          placeholder="Filtrar por ação (ex.: STATUS_CHANGE)"
          value={actionF}
          onChange={(e) => {
            setActionF(e.target.value);
            setPage(1);
          }}
          className="sm:w-64"
        />
      </div>

      <div className="rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Quando</TableHead>
              <TableHead>Módulo / Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>IP</TableHead>
              <TableHead>Dados</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <CarLoader className="mx-auto size-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  Nenhum evento.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {new Date(r.createdAt).toLocaleString('pt-BR')}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{r.module}</span>
                    <div>
                      <Badge variant="secondary">{r.action}</Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{r.entity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {r.userName ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
                  <TableCell>
                    {r.before || r.after ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-primary">ver</summary>
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-muted p-2 text-[10px]">
                          {JSON.stringify({ antes: r.before, depois: r.after }, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {meta.total} evento(s) · página {meta.page} de {meta.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
