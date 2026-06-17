'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Wrench } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { installSystemSchema } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { useInstallStatus } from '@/features/auth/use-install-status';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { maskCep, maskCnpj, maskPhone, onlyDigits } from '@/lib/masks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const FIELD_LABELS = {
  shopName: 'Nome da oficina',
  slug: 'Identificador',
  cnpj: 'CNPJ',
  tagline: 'Slogan',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail de contato',
  addressZip: 'CEP',
  addressStreet: 'Rua',
  addressNumber: 'Número',
  addressComplement: 'Complemento',
  addressDistrict: 'Bairro',
  addressCity: 'Cidade',
  addressState: 'UF',
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

export default function InstalarPage() {
  const router = useRouter();
  const { install, status } = useAuth();
  const { data: installStatus } = useInstallStatus();

  const [form, setForm] = useState({
    shopName: '',
    slug: '',
    cnpj: '',
    tagline: '',
    phone: '',
    whatsapp: '',
    email: '',
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
    adminName: '',
    adminEmail: '',
    password: '',
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  // Já instalado ou já logado → não faz sentido instalar de novo.
  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
  }, [status, router]);
  useEffect(() => {
    if (installStatus?.installed) router.replace('/login');
  }, [installStatus, router]);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onShopNameChange(value: string) {
    setForm((f) => ({
      ...f,
      shopName: value,
      slug: slugTouched ? f.slug : slugify(value),
    }));
  }

  async function lookupCep() {
    const cep = onlyDigits(form.addressZip);
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (!data.erro) {
        setForm((f) => ({
          ...f,
          addressStreet: data.logradouro || f.addressStreet,
          addressDistrict: data.bairro || f.addressDistrict,
          addressCity: data.localidade || f.addressCity,
          addressState: data.uf || f.addressState,
        }));
      }
    } catch {
      /* silencioso: o usuário pode preencher manualmente */
    } finally {
      setCepLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = installSystemSchema.safeParse(form);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await install(parsed.data);
      toast.success('Sistema instalado! Bem-vindo.');
      router.replace('/dashboard');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS, 'Falha ao instalar o sistema'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl rounded-xl border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Wrench className="size-6" />
          </span>
          <h1 className="text-xl font-semibold">Instalação do sistema</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Configure a oficina matriz e o super usuário para começar.
          </p>
        </div>

        <div className="space-y-6">
          {/* Oficina matriz */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Oficina matriz</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome da oficina" error={errors.shopName} required>
                <Input
                  value={form.shopName}
                  onChange={(e) => onShopNameChange(e.target.value)}
                  placeholder="Auto Mecânica Modelo"
                />
              </Field>
              <Field label="Identificador (acesso)" error={errors.slug} required>
                <Input
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', slugify(e.target.value));
                  }}
                  placeholder="matriz"
                />
              </Field>
              <Field label="CNPJ" error={errors.cnpj}>
                <Input
                  value={form.cnpj}
                  onChange={(e) => set('cnpj', maskCnpj(e.target.value))}
                  inputMode="numeric"
                  maxLength={18}
                  placeholder="00.000.000/0000-00"
                />
              </Field>
              <Field label="Slogan (site)" error={errors.tagline}>
                <Input
                  value={form.tagline}
                  onChange={(e) => set('tagline', e.target.value)}
                  placeholder="Sua oficina de confiança"
                />
              </Field>
            </div>
          </section>

          {/* Endereço */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Endereço</h2>
            <div className="grid gap-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Field label="CEP" error={errors.addressZip}>
                  <div className="relative">
                    <Input
                      value={form.addressZip}
                      onChange={(e) => set('addressZip', maskCep(e.target.value))}
                      onBlur={lookupCep}
                      inputMode="numeric"
                      maxLength={9}
                      placeholder="00000-000"
                    />
                    {cepLoading && (
                      <CarLoader className="absolute right-2 top-2.5 size-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                </Field>
              </div>
              <div className="sm:col-span-3">
                <Field label="Rua" error={errors.addressStreet}>
                  <Input
                    value={form.addressStreet}
                    onChange={(e) => set('addressStreet', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="Número" error={errors.addressNumber}>
                  <Input
                    value={form.addressNumber}
                    onChange={(e) => set('addressNumber', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Complemento" error={errors.addressComplement}>
                  <Input
                    value={form.addressComplement}
                    onChange={(e) => set('addressComplement', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Bairro" error={errors.addressDistrict}>
                  <Input
                    value={form.addressDistrict}
                    onChange={(e) => set('addressDistrict', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="Cidade" error={errors.addressCity}>
                  <Input
                    value={form.addressCity}
                    onChange={(e) => set('addressCity', e.target.value)}
                  />
                </Field>
              </div>
              <div className="sm:col-span-1">
                <Field label="UF" error={errors.addressState}>
                  <Input
                    value={form.addressState}
                    onChange={(e) => set('addressState', e.target.value.toUpperCase().slice(0, 2))}
                    maxLength={2}
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* Contato */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">Contato</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Telefone" error={errors.phone}>
                <Input
                  value={form.phone}
                  onChange={(e) => set('phone', maskPhone(e.target.value))}
                  inputMode="tel"
                  maxLength={15}
                  placeholder="(00) 0000-0000"
                />
              </Field>
              <Field label="WhatsApp" error={errors.whatsapp}>
                <Input
                  value={form.whatsapp}
                  onChange={(e) => set('whatsapp', maskPhone(e.target.value))}
                  inputMode="tel"
                  maxLength={15}
                  placeholder="(00) 00000-0000"
                />
              </Field>
              <Field label="E-mail de contato" error={errors.email}>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="contato@oficina.com"
                />
              </Field>
            </div>
          </section>

          {/* Super usuário */}
          <section className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground">
              Super usuário (acesso a todas as oficinas)
            </h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Seu nome" error={errors.adminName} required>
                <Input value={form.adminName} onChange={(e) => set('adminName', e.target.value)} />
              </Field>
              <Field label="E-mail" error={errors.adminEmail} required>
                <Input
                  type="email"
                  autoComplete="username"
                  value={form.adminEmail}
                  onChange={(e) => set('adminEmail', e.target.value)}
                  placeholder="voce@email.com"
                />
              </Field>
              <Field label="Senha" error={errors.password} required>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  placeholder="Mínimo de 8 caracteres"
                />
              </Field>
            </div>
          </section>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting && <CarLoader className="size-4 animate-spin" />}
            Instalar e entrar
          </Button>
        </div>
      </form>
    </main>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
