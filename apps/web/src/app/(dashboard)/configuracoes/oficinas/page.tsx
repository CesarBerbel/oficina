'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, Pencil, Copy, X, ArrowUpCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAccountBranchSchema,
  renameTenantSchema,
  type CreatedBranchDto,
  type PlatformTenantDto,
} from '@oficina/shared';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { zodFieldErrors } from '@/lib/form-errors';
import {
  useAccountTenants,
  useCreateAccountBranch,
  useRenameTenant,
} from '@/features/tenants/use-account-tenants';
import { useBillingUsage } from '@/features/billing/use-billing';
import { CarLoader } from '@/components/car-loader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// PR seguinte aponta para a página de planos do apex; por ora, a tela do plano.
const UPGRADE_HREF = '/configuracoes/plano';

export default function OficinasPage() {
  const { user } = useAuth();
  const tenants = useAccountTenants();
  const billing = useBillingUsage();
  const createBranch = useCreateAccountBranch();
  const rename = useRenameTenant();

  const list = tenants.data ?? [];
  const myTenant = list.find((t) => t.id === user?.tenantId);
  const isOwner = user?.role === 'ADMIN' && !!myTenant?.isMatriz;

  const branchQuota = billing.data?.usage.find((u) => u.feature === 'BRANCHES');
  const canAddBranch = branchQuota
    ? branchQuota.enabled && (branchQuota.limit == null || branchQuota.used < branchQuota.limit)
    : true;

  const [renaming, setRenaming] = useState<PlatformTenantDto | null>(null);
  const [adding, setAdding] = useState(false);
  const [created, setCreated] = useState<CreatedBranchDto | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Building2 className="size-6 text-primary" /> Minhas oficinas
          </h1>
          <p className="text-muted-foreground">
            A matriz é a oficina principal (não pode deixar de ser matriz). Você pode renomeá-la e
            adicionar filiais conforme o seu plano.
          </p>
        </div>
        {isOwner &&
          (canAddBranch ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Adicionar filial
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link href={UPGRADE_HREF}>
                <ArrowUpCircle className="size-4" /> Fazer upgrade
              </Link>
            </Button>
          ))}
      </div>

      {!isOwner && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          <ShieldAlert className="size-4" /> Apenas o administrador geral da oficina (matriz) pode
          renomear ou adicionar filiais.
        </div>
      )}

      {!canAddBranch && isOwner && branchQuota && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-700">
            Seu plano permite {branchQuota.limit} oficina(s) e você já usa {branchQuota.used}. Faça
            upgrade para adicionar filiais.
          </p>
          <Link
            href={UPGRADE_HREF}
            className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-amber-700 hover:underline"
          >
            Ver planos <ArrowUpCircle className="size-4" />
          </Link>
        </div>
      )}

      {created && (
        <div className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-emerald-700">
                Filial criada — repasse o acesso ao admin dela:
              </p>
              <p>
                <span className="text-muted-foreground">Oficina:</span> {created.tenant.name} (
                {created.tenant.slug})
              </p>
              <p>
                <span className="text-muted-foreground">E-mail:</span> {created.admin.email}
              </p>
              <p>
                <span className="text-muted-foreground">Senha temporária:</span>{' '}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono">
                  {created.tempPassword}
                </code>
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.clipboard?.writeText(created.tempPassword);
                  toast.success('Senha copiada');
                }}
              >
                <Copy className="size-4" /> Copiar
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCreated(null)}>
                <X className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-card">
        {tenants.isLoading ? (
          <div className="p-10">
            <CarLoader />
          </div>
        ) : list.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Nenhuma oficina encontrada.</p>
        ) : (
          <ul className="divide-y">
            {list.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 p-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{t.name}</span>
                    <Badge variant={t.isMatriz ? 'success' : 'secondary'}>
                      {t.isMatriz ? 'Matriz' : 'Filial'}
                    </Badge>
                    {!t.active && <Badge variant="secondary">Inativa</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t.slug} · {t.usersCount} usuário(s) · {t.serviceOrdersCount} OS
                  </p>
                </div>
                {isOwner && (
                  <Button variant="outline" size="sm" onClick={() => setRenaming(t)}>
                    <Pencil className="size-4" /> Renomear
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {renaming && (
        <RenameDialog
          tenant={renaming}
          onClose={() => setRenaming(null)}
          onSubmit={async (input) => {
            await rename.mutateAsync({ id: renaming.id, input });
          }}
          pending={rename.isPending}
        />
      )}

      {adding && (
        <AddBranchDialog
          onClose={() => setAdding(false)}
          onSubmit={async (input) => {
            const result = await createBranch.mutateAsync(input);
            setCreated(result);
            setAdding(false);
          }}
          pending={createBranch.isPending}
        />
      )}
    </div>
  );
}

function RenameDialog({
  tenant,
  onClose,
  onSubmit,
  pending,
}: {
  tenant: PlatformTenantDto;
  onClose: () => void;
  onSubmit: (input: { name: string; slug: string }) => Promise<void>;
  pending: boolean;
}) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = renameTenantSchema.safeParse({ name, slug });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, { name: 'Nome', slug: 'Identificador' }));
      return;
    }
    try {
      await onSubmit(parsed.data);
      toast.success('Oficina renomeada');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao renomear');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renomear {tenant.isMatriz ? 'matriz' : 'filial'}</DialogTitle>
          <DialogDescription>
            {tenant.isMatriz
              ? 'A matriz continua sendo a oficina principal; só muda o nome/identificador.'
              : 'Atualize o nome e o identificador da filial.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label required>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Matriz Centro"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <Label required>Identificador (slug)</Label>
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="matriz-centro"
            />
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddBranchDialog({
  onClose,
  onSubmit,
  pending,
}: {
  onClose: () => void;
  onSubmit: (input: {
    shopName: string;
    slug: string;
    adminName: string;
    adminEmail: string;
  }) => Promise<void>;
  pending: boolean;
}) {
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createAccountBranchSchema.safeParse({ shopName, slug, adminName, adminEmail });
    if (!parsed.success) {
      setErrors(
        zodFieldErrors(parsed.error, {
          shopName: 'Nome da filial',
          slug: 'Identificador',
          adminName: 'Nome do admin',
          adminEmail: 'E-mail do admin',
        }),
      );
      return;
    }
    try {
      await onSubmit(parsed.data);
      toast.success('Filial criada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Falha ao criar filial');
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova filial</DialogTitle>
          <DialogDescription>
            A filial entra com um administrador próprio (senha temporária gerada na hora).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Nome da filial</Label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} />
              {errors.shopName && <p className="text-xs text-destructive">{errors.shopName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>Identificador (slug)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
              {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>Nome do administrador</Label>
              <Input value={adminName} onChange={(e) => setAdminName(e.target.value)} />
              {errors.adminName && <p className="text-xs text-destructive">{errors.adminName}</p>}
            </div>
            <div className="space-y-1.5">
              <Label required>E-mail do administrador</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
              />
              {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              Criar filial
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
