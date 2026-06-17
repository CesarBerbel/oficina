'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { registerTenantSchema } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { maskCnpj, maskPhone } from '@/lib/masks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_LABELS = {
  shopName: 'Nome da oficina',
  slug: 'Identificador',
  cnpj: 'CNPJ',
  phone: 'Telefone',
  adminName: 'Seu nome',
  adminEmail: 'E-mail',
  password: 'Senha',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export default function CadastroPage() {
  const router = useRouter();
  const { register, status } = useAuth();
  const [shopName, setShopName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [phone, setPhone] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);

  // Sugere o identificador a partir do nome enquanto o usuário não o editar.
  function onShopNameChange(value: string) {
    setShopName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = registerTenantSchema.safeParse({
      shopName,
      slug,
      cnpj,
      phone,
      adminName,
      adminEmail,
      password,
    });
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await register(parsed.data);
      toast.success('Oficina criada! Bem-vindo.');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao criar a oficina'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Criar sua oficina</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cadastre a oficina e o usuário administrador para começar
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shopName" required>Nome da oficina</Label>
            <Input
              id="shopName"
              value={shopName}
              onChange={(e) => onShopNameChange(e.target.value)}
              placeholder="Auto Mecânica Modelo"
            />
            {errors.shopName && <p className="text-xs text-destructive">{errors.shopName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slug" required>Identificador (acesso)</Label>
            <Input
              id="slug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              placeholder="minha-oficina"
            />
            <p className="text-xs text-muted-foreground">
              Usado para entrar no sistema. Letras minúsculas, números e hífens.
            </p>
            {errors.slug && <p className="text-xs text-destructive">{errors.slug}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cnpj">CNPJ</Label>
              <Input
                id="cnpj"
                value={cnpj}
                onChange={(e) => setCnpj(maskCnpj(e.target.value))}
                inputMode="numeric"
                maxLength={18}
                placeholder="00.000.000/0000-00"
              />
              {errors.cnpj && <p className="text-xs text-destructive">{errors.cnpj}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Telefone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminName" required>Seu nome</Label>
            <Input
              id="adminName"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              placeholder="Nome do administrador"
            />
            {errors.adminName && <p className="text-xs text-destructive">{errors.adminName}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adminEmail" required>E-mail</Label>
            <Input
              id="adminEmail"
              type="email"
              autoComplete="username"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="voce@email.com"
            />
            {errors.adminEmail && <p className="text-xs text-destructive">{errors.adminEmail}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" required>Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo de 8 caracteres"
            />
            {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <CarLoader className="size-4 animate-spin" />}
            Criar oficina
          </Button>

          <p className="text-center text-sm text-muted-foreground">
            Já tem uma oficina?{' '}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Entrar
            </Link>
          </p>
        </div>
      </form>
    </main>
  );
}
