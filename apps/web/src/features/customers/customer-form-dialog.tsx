'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import {
  createCustomerSchema,
  updateCustomerSchema,
  CustomerType,
  CUSTOMER_TYPE_LABELS,
  type CustomerDto,
} from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useCreateCustomer, useUpdateCustomer } from './use-customers';
import { useCategories } from '@/features/categories/use-categories';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { maskCep, maskCnpj, maskCpf, maskPhone, onlyDigits } from '@/lib/masks';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: CustomerDto | null;
  /** Chamado com o id do cliente recém-criado (ex.: seleção no wizard de OS). */
  onCreated?: (id: string) => void;
}

interface CustomerFormState {
  type: string;
  name: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  zip: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  categories: string[];
  notes: string;
  birthDate: string;
}

type TextField = Exclude<keyof CustomerFormState, 'categories'>;

const empty: CustomerFormState = {
  type: CustomerType.PF as string,
  name: '',
  document: '',
  phone: '',
  whatsapp: '',
  email: '',
  zip: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  categories: [],
  notes: '',
  birthDate: '',
};

const FIELD_LABELS = {
  type: 'Tipo',
  name: 'Nome/Razão social',
  document: 'CPF/CNPJ',
  phone: 'Telefone',
  whatsapp: 'WhatsApp',
  email: 'E-mail',
  zip: 'CEP',
  street: 'Rua',
  number: 'Número',
  complement: 'Complemento',
  district: 'Bairro',
  city: 'Cidade',
  state: 'UF',
  categories: 'Categorias',
  notes: 'Observações',
  birthDate: 'Data de nascimento',
};

interface ViaCepResponse {
  cep?: string;
  logradouro?: string;
  complemento?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
  erro?: boolean;
}

function normalizeCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function CustomerFormDialog({ open, onOpenChange, customer, onCreated }: Props) {
  const isEdit = !!customer;
  const [form, setForm] = useState<CustomerFormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cepLoading, setCepLoading] = useState(false);

  const { data: categoryData } = useCategories('CUSTOMER');
  const configuredCategories = useMemo(
    () =>
      (categoryData ?? [])
        .filter((c) => c.active)
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [categoryData],
  );
  const availableCategories = configuredCategories.filter(
    (category) =>
      !form.categories.some((selected) => selected.toLowerCase() === category.toLowerCase()),
  );

  const create = useCreateCustomer();
  const update = useUpdateCustomer(customer?.id ?? '');
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (!open) return;
    if (customer) {
      setForm({
        type: customer.type,
        name: customer.name,
        document: customer.type === 'PJ' ? maskCnpj(customer.document) : maskCpf(customer.document),
        phone: maskPhone(customer.phone),
        whatsapp: maskPhone(customer.whatsapp),
        email: customer.email ?? '',
        zip: maskCep(customer.zip),
        street: customer.street ?? '',
        number: customer.number ?? '',
        complement: customer.complement ?? '',
        district: customer.district ?? '',
        city: customer.city ?? '',
        state: customer.state ?? '',
        categories: customer.categories ?? [],
        notes: customer.notes ?? '',
        birthDate: customer.birthDate ?? '',
      });
    } else {
      setForm(empty);
    }
    setErrors({});
  }, [open, customer]);

  function set<K extends TextField>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setType(value: string) {
    setForm((f) => ({
      ...f,
      type: value,
      document: value === 'PJ' ? maskCnpj(f.document) : maskCpf(f.document),
    }));
  }

  function addCategory(value: string) {
    const category = normalizeCategory(value);
    if (!category) return;
    setForm((f) => {
      if (f.categories.some((item) => item.toLowerCase() === category.toLowerCase())) return f;
      return { ...f, categories: [...f.categories, category] };
    });
    setErrors((current) => {
      const next = { ...current };
      delete next.categories;
      return next;
    });
  }

  function removeCategory(category: string) {
    setForm((f) => ({ ...f, categories: f.categories.filter((item) => item !== category) }));
  }

  async function lookupCep() {
    const cep = onlyDigits(form.zip);
    if (cep.length !== 8) {
      setErrors((current) => ({ ...current, zip: 'CEP: informe um CEP com 8 dígitos' }));
      return;
    }

    setCepLoading(true);
    setErrors((current) => {
      const next = { ...current };
      delete next.zip;
      return next;
    });

    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) throw new Error('CEP inválido');
      const data = (await res.json()) as ViaCepResponse;
      if (data.erro) {
        setErrors((current) => ({ ...current, zip: 'CEP: CEP não encontrado' }));
        return;
      }

      setForm((f) => ({
        ...f,
        zip: maskCep(data.cep ?? cep),
        street: data.logradouro ?? f.street,
        complement: f.complement || data.complemento || '',
        district: data.bairro ?? f.district,
        city: data.localidade ?? f.city,
        state: (data.uf ?? f.state).toUpperCase(),
      }));
      toast.success('Endereço preenchido pelo CEP');
    } catch {
      setErrors((current) => ({ ...current, zip: 'CEP: não foi possível consultar o CEP' }));
    } finally {
      setCepLoading(false);
    }
  }

  async function submit(addAnother: boolean) {
    const payload = {
      ...form,
      categories: form.categories.map((c) => c.trim()).filter(Boolean),
    };
    const schema = isEdit ? updateCustomerSchema : createCustomerSchema;
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      setErrors(zodFieldErrors(parsed.error, FIELD_LABELS));
      return;
    }
    setErrors({});
    try {
      if (isEdit) {
        await update.mutateAsync(parsed.data);
        toast.success('Cliente atualizado');
      } else {
        const createdCustomer = (await create.mutateAsync(parsed.data as never)) as CustomerDto;
        toast.success('Cliente criado');
        // Em "adicionar outro" não seleciona (mantém o fluxo de cadastro em série).
        if (!addAnother) onCreated?.(createdCustomer.id);
      }
      if (addAnother && !isEdit) {
        setForm(empty);
        setErrors({});
      } else {
        onOpenChange(false);
      }
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void submit(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
          <DialogDescription>Dados cadastrais, contato e endereço.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Tipo" required>
              <Select value={form.type} onChange={(e) => setType(e.target.value)}>
                {Object.entries(CUSTOMER_TYPE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label={form.type === 'PJ' ? 'Razão social' : 'Nome'}
              error={errors.name}
              required
              className="sm:col-span-2"
            >
              <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label={form.type === 'PJ' ? 'CNPJ (opcional)' : 'CPF (opcional)'}
              error={errors.document}
            >
              <Input
                inputMode="numeric"
                maxLength={form.type === 'PJ' ? 18 : 14}
                placeholder={form.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                value={form.document}
                onChange={(e) =>
                  set(
                    'document',
                    form.type === 'PJ' ? maskCnpj(e.target.value) : maskCpf(e.target.value),
                  )
                }
              />
            </Field>
            <Field label="Telefone" error={errors.phone}>
              <Input
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={form.phone}
                onChange={(e) => set('phone', maskPhone(e.target.value))}
              />
            </Field>
            <Field label="WhatsApp" error={errors.whatsapp}>
              <Input
                inputMode="tel"
                maxLength={15}
                placeholder="(00) 00000-0000"
                value={form.whatsapp}
                onChange={(e) => set('whatsapp', maskPhone(e.target.value))}
              />
            </Field>
          </div>

          <Field label="E-mail" error={errors.email}>
            <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          </Field>

          <Field label="Data de nascimento" error={errors.birthDate}>
            <Input
              type="date"
              value={form.birthDate}
              onChange={(e) => set('birthDate', e.target.value)}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-4">
            <Field label="CEP" error={errors.zip}>
              <div className="flex gap-2">
                <Input
                  inputMode="numeric"
                  maxLength={9}
                  placeholder="00000-000"
                  value={form.zip}
                  onChange={(e) => set('zip', maskCep(e.target.value))}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => void lookupCep()}
                  disabled={cepLoading}
                  aria-label="Buscar CEP"
                >
                  {cepLoading ? (
                    <CarLoader className="size-4 animate-spin" />
                  ) : (
                    <Search className="size-4" />
                  )}
                </Button>
              </div>
            </Field>
            <Field label="Rua" className="sm:col-span-3">
              <Input value={form.street} onChange={(e) => set('street', e.target.value)} />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-6">
            <Field label="Número" className="sm:col-span-1">
              <Input value={form.number} onChange={(e) => set('number', e.target.value)} />
            </Field>
            <Field label="Complemento" className="sm:col-span-2">
              <Input value={form.complement} onChange={(e) => set('complement', e.target.value)} />
            </Field>
            <Field label="Bairro" className="sm:col-span-3">
              <Input value={form.district} onChange={(e) => set('district', e.target.value)} />
            </Field>
            <Field label="Cidade" className="sm:col-span-5">
              <Input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                placeholder="Cidade"
              />
            </Field>
            <Field label="UF" className="sm:col-span-1">
              <Input
                value={form.state}
                onChange={(e) => set('state', e.target.value.toUpperCase())}
                placeholder="UF"
                maxLength={2}
              />
            </Field>
          </div>

          <Field label="Categorias" error={errors.categories}>
            <Select
              value=""
              onChange={(e) => {
                addCategory(e.target.value);
                e.currentTarget.value = '';
              }}
              disabled={configuredCategories.length === 0 || availableCategories.length === 0}
            >
              <option value="">
                {configuredCategories.length === 0
                  ? 'Cadastre categorias em Configurações › Categorias'
                  : availableCategories.length === 0
                    ? 'Todas as categorias já foram selecionadas'
                    : 'Selecione uma categoria'}
              </option>
              {availableCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>
            <p className="text-xs text-muted-foreground">
              As opções são cadastradas em{' '}
              <Link
                href="/categorias"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Configurações › Categorias
              </Link>
              .
            </p>
            {form.categories.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {form.categories.map((category) => (
                  <span
                    key={category}
                    className="inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-sm"
                  >
                    {category}
                    <button
                      type="button"
                      className="rounded-full text-muted-foreground transition hover:text-destructive"
                      onClick={() => removeCategory(category)}
                      aria-label={`Remover categoria ${category}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Field>

          <Field label="Observações">
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {!isEdit && (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => void submit(true)}
              >
                Salvar e adicionar outro
              </Button>
            )}
            <Button type="submit" disabled={pending}>
              {pending && <CarLoader className="size-4 animate-spin" />}
              {isEdit ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  className,
  required,
  children,
}: {
  label: string;
  error?: string;
  className?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${className ?? ''}`}>
      <Label required={required}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
