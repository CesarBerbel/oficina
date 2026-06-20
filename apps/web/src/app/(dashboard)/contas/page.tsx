'use client';

import { useState } from 'react';
import { Store, Check, X, Power, Copy, ShieldAlert, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import type {
  AccountDto,
  AccountRequestDto,
  ProvisionedAccountDto,
  ResetAdminPasswordDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatDate } from '@/lib/utils';
import {
  usePlatformAccounts,
  useAccountRequests,
  useApproveRequest,
  useRejectRequest,
  useSetAccountStatus,
  usePlatformPlans,
  useAssignAccountPlan,
  useResetAccountAdminPassword,
  usePlatformUpgradeRequests,
  useApproveUpgradeRequest,
  useRejectUpgradeRequest,
} from '@/features/platform/use-accounts';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const STATUS_BADGE: Record<AccountDto['status'], { label: string; variant: string }> = {
  ACTIVE: { label: 'Ativa', variant: 'success' },
  PENDING: { label: 'Pendente', variant: 'secondary' },
  SUSPENDED: { label: 'Suspensa', variant: 'secondary' },
};

export default function ContasPage() {
  const { user } = useAuth();
  const accounts = usePlatformAccounts();
  const requests = useAccountRequests();
  const approve = useApproveRequest();
  const reject = useRejectRequest();
  const setStatus = useSetAccountStatus();
  const plans = usePlatformPlans();
  const assignPlan = useAssignAccountPlan();
  const resetPw = useResetAccountAdminPassword();
  const upgrades = usePlatformUpgradeRequests();
  const approveUpgrade = useApproveUpgradeRequest();
  const rejectUpgrade = useRejectUpgradeRequest();
  const confirm = useConfirm();
  const [provisioned, setProvisioned] = useState<ProvisionedAccountDto | null>(null);
  const [resetResult, setResetResult] = useState<
    (ResetAdminPasswordDto & { accountName: string }) | null
  >(null);

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

  async function onApprove(r: AccountRequestDto) {
    const ok = await confirm({
      title: 'Aprovar pedido',
      description: `Criar a conta "${r.name}" em ${r.slug}? Será gerada uma senha temporária para ${r.email}.`,
      confirmLabel: 'Aprovar e criar',
    });
    if (!ok) return;
    try {
      const result = await approve.mutateAsync(r.id);
      setProvisioned(result);
      toast.success('Conta criada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao aprovar');
    }
  }

  async function onReject(r: AccountRequestDto) {
    const ok = await confirm({
      title: 'Recusar pedido',
      description: `Recusar o pedido de "${r.name}"?`,
      destructive: true,
      confirmLabel: 'Recusar',
    });
    if (!ok) return;
    try {
      await reject.mutateAsync(r.id);
      toast.success('Pedido recusado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao recusar');
    }
  }

  async function onAssignPlan(accountId: string, planId: string) {
    if (!planId) return;
    try {
      await assignPlan.mutateAsync({ accountId, input: { planId, status: 'ACTIVE' } });
      toast.success('Plano atualizado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar plano');
    }
  }

  async function onResetPassword(a: AccountDto) {
    const ok = await confirm({
      title: 'Resetar senha do admin',
      description: `Gerar uma nova senha temporária para o admin de "${a.name}"? As sessões ativas dele serão encerradas e a troca será obrigatória no próximo login.`,
      confirmLabel: 'Gerar nova senha',
    });
    if (!ok) return;
    try {
      const result = await resetPw.mutateAsync(a.id);
      setResetResult({ ...result, accountName: a.name });
      toast.success('Senha redefinida');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao resetar a senha');
    }
  }

  async function onApproveUpgrade(id: string, accountName: string, planName: string) {
    const ok = await confirm({
      title: 'Aprovar upgrade',
      description: `Atribuir o plano "${planName}" à conta "${accountName}"?`,
      confirmLabel: 'Aprovar e atribuir',
    });
    if (!ok) return;
    try {
      await approveUpgrade.mutateAsync(id);
      toast.success('Plano atribuído');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao aprovar');
    }
  }

  async function onRejectUpgrade(id: string) {
    const ok = await confirm({
      title: 'Recusar pedido de upgrade',
      description: 'Recusar este pedido de upgrade?',
      destructive: true,
      confirmLabel: 'Recusar',
    });
    if (!ok) return;
    try {
      await rejectUpgrade.mutateAsync(id);
      toast.success('Pedido recusado');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao recusar');
    }
  }

  async function onToggle(a: AccountDto) {
    const suspend = a.status !== 'SUSPENDED';
    const ok = await confirm({
      title: suspend ? 'Suspender conta' : 'Reativar conta',
      description: suspend
        ? `Suspender "${a.name}"? Os usuários da conta perdem o acesso na hora.`
        : `Reativar "${a.name}"?`,
      destructive: suspend,
      confirmLabel: suspend ? 'Suspender' : 'Reativar',
    });
    if (!ok) return;
    try {
      await setStatus.mutateAsync({ id: a.id, status: suspend ? 'SUSPENDED' : 'ACTIVE' });
      toast.success(suspend ? 'Conta suspensa' : 'Conta reativada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao atualizar');
    }
  }

  const pending = requests.data ?? [];
  const accs = accounts.data ?? [];
  const planOptions = plans.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <Store className="size-6 text-primary" /> Contas
        </h1>
        <p className="text-muted-foreground">
          Pedidos de criação e contas (clientes) da plataforma.
        </p>
      </div>

      {provisioned && (
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-emerald-700">Conta criada — repasse o acesso:</p>
              <p>
                <span className="text-muted-foreground">Acesso:</span>{' '}
                {provisioned.loginUrl ?? `oficina: ${provisioned.account.slug}`}
              </p>
              <p>
                <span className="text-muted-foreground">E-mail:</span> {provisioned.admin.email}
              </p>
              <p>
                <span className="text-muted-foreground">Senha temporária:</span>{' '}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono">
                  {provisioned.tempPassword}
                </code>
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(provisioned.tempPassword);
                  toast.success('Senha copiada');
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setProvisioned(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {resetResult && (
        <div className="rounded-xl border border-amber-600/30 bg-amber-600/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-amber-700">
                Senha redefinida — repasse ao admin de {resetResult.accountName}:
              </p>
              <p>
                <span className="text-muted-foreground">E-mail:</span> {resetResult.adminEmail}
              </p>
              <p>
                <span className="text-muted-foreground">Senha temporária:</span>{' '}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono">
                  {resetResult.tempPassword}
                </code>
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(resetResult.tempPassword);
                  toast.success('Senha copiada');
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setResetResult(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Pedidos pendentes */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Pedidos pendentes {pending.length > 0 && `(${pending.length})`}
        </h2>
        {requests.isLoading ? (
          <CarLoader className="size-5 animate-spin text-muted-foreground" />
        ) : pending.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Nenhum pedido pendente.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Oficina</TableHead>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Recebido</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.slug}</TableCell>
                    <TableCell className="text-sm">
                      {r.contactName}
                      <span className="block text-xs text-muted-foreground">{r.email}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(r.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => onApprove(r)} disabled={approve.isPending}>
                          <Check className="size-4" /> Aprovar
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onReject(r)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* Pedidos de upgrade de plano */}
      {(upgrades.data?.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Pedidos de upgrade ({upgrades.data!.length})
          </h2>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Plano solicitado</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upgrades.data!.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="font-medium">{u.accountName}</div>
                      <div className="text-xs text-muted-foreground">{u.accountSlug}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{u.planName}</div>
                      <div className="text-xs text-muted-foreground">{u.planCode}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          disabled={approveUpgrade.isPending}
                          onClick={() => onApproveUpgrade(u.id, u.accountName, u.planName)}
                        >
                          <Check className="size-4" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={rejectUpgrade.isPending}
                          onClick={() => onRejectUpgrade(u.id)}
                        >
                          <X className="size-4" /> Recusar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}

      {/* Contas */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">Contas</h2>
        {accounts.isLoading ? (
          <CarLoader className="size-5 animate-spin text-muted-foreground" />
        ) : accs.length === 0 ? (
          <p className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Nenhuma conta ainda.
          </p>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Conta</TableHead>
                  <TableHead>Subdomínio</TableHead>
                  <TableHead className="text-right">Oficinas</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Criada</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accs.map((a) => {
                  const badge = STATUS_BADGE[a.status];
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.slug}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.oficinasCount}</TableCell>
                      <TableCell className="min-w-[180px]">
                        <Select
                          value={a.plan.id ?? ''}
                          disabled={assignPlan.isPending || plans.isLoading}
                          onChange={(e) => onAssignPlan(a.id, e.target.value)}
                        >
                          <option value="">Sem plano</option>
                          {planOptions.map((plan) => (
                            <option key={plan.id} value={plan.id}>
                              {plan.name}
                            </option>
                          ))}
                        </Select>
                        {a.plan.code && (
                          <p className="mt-1 text-xs text-muted-foreground">{a.plan.code}</p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(a.createdAt)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={badge.variant as 'success' | 'secondary'}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={resetPw.isPending}
                            onClick={() => onResetPassword(a)}
                            title="Gerar nova senha temporária para o admin"
                          >
                            <KeyRound className="size-4" /> Senha
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => onToggle(a)}>
                            <Power className="size-4" />
                            {a.status === 'SUSPENDED' ? 'Reativar' : 'Suspender'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
