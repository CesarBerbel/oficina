'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Loader2, Plus, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { updateSiteSettingsSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useSiteSettings, useUpdateSiteSettings } from '@/features/content/use-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ImageUpload } from '@/components/image-upload';
import { maskCnpj, maskPhone } from '@/lib/masks';

const FIELDS: { key: string; label: string; area?: boolean; full?: boolean; required?: boolean }[] = [
  { key: 'shopName', label: 'Nome da oficina', required: true },
  { key: 'tagline', label: 'Slogan' },
  { key: 'heroTitle', label: 'Título da home' },
  { key: 'heroSubtitle', label: 'Subtítulo da home', full: true },
  { key: 'about', label: 'Sobre (texto institucional)', area: true, full: true },
  { key: 'phone', label: 'Telefone' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'E-mail' },
  { key: 'cnpj', label: 'CNPJ (opcional)' },
  { key: 'address', label: 'Endereço', full: true },
  { key: 'hours', label: 'Horários' },
  { key: 'instagram', label: 'Instagram (URL)' },
  { key: 'facebook', label: 'Facebook (URL)' },
  { key: 'logoUrl', label: 'Logo (URL)' },
  { key: 'logoPdfUrl', label: 'Logo para PDF (URL)' },
  { key: 'pdfFooterText', label: 'Rodapé do PDF', area: true, full: true },
  { key: 'capacity', label: 'Capacidade da oficina (OS simultâneas)' },
  { key: 'mapsEmbed', label: 'Google Maps (código embed)', area: true, full: true },
];

const FIELD_LABELS = {
  ...Object.fromEntries(FIELDS.map((field) => [field.key, field.label.replace(' (opcional)', '')])),
  customerCategories: 'Categorias de clientes',
} as Record<string, string>;

function normalizeCategory(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export default function SiteConfigPage() {
  const { data, isLoading } = useSiteSettings();
  const update = useUpdateSiteSettings();
  const [form, setForm] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(false);
  const [customerCategories, setCustomerCategories] = useState<string[]>([]);
  const [categoryInput, setCategoryInput] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (data) {
      const f: Record<string, string> = {};
      const rec = data as unknown as Record<string, unknown>;
      for (const fld of FIELDS) {
        const value = rec[fld.key]?.toString() ?? '';
        if (fld.key === 'phone' || fld.key === 'whatsapp') f[fld.key] = maskPhone(value);
        else if (fld.key === 'cnpj') f[fld.key] = maskCnpj(value);
        else f[fld.key] = value;
      }
      setForm(f);
      setPublished(data.published);
      setCustomerCategories(data.customerCategories ?? []);
      setCategoryInput('');
      setErrors({});
    }
  }, [data]);

  const sortedCustomerCategories = useMemo(
    () => [...customerCategories].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [customerCategories],
  );

  function setField(key: string, value: string) {
    const masked =
      key === 'phone' || key === 'whatsapp'
        ? maskPhone(value)
        : key === 'cnpj'
          ? maskCnpj(value)
          : value;
    setForm((current) => ({ ...current, [key]: masked }));
  }

  function addCategory() {
    const category = normalizeCategory(categoryInput);
    if (!category) {
      setErrors((current) => ({
        ...current,
        customerCategories: 'Categorias de clientes: informe o nome da categoria',
      }));
      return;
    }
    if (category.length > 40) {
      setErrors((current) => ({
        ...current,
        customerCategories: 'Categorias de clientes: use no máximo 40 caracteres por categoria',
      }));
      return;
    }
    if (customerCategories.some((item) => item.toLowerCase() === category.toLowerCase())) {
      setErrors((current) => ({
        ...current,
        customerCategories: 'Categorias de clientes: esta categoria já está cadastrada',
      }));
      return;
    }
    setCustomerCategories((current) => [...current, category]);
    setCategoryInput('');
    setErrors((current) => {
      const next = { ...current };
      delete next.customerCategories;
      return next;
    });
  }

  function removeCategory(category: string) {
    setCustomerCategories((current) => current.filter((item) => item !== category));
  }

  async function save() {
    const payload = {
      ...form,
      customerCategories: sortedCustomerCategories,
      published,
    };
    const parsed = updateSiteSettingsSchema.safeParse(payload);
    if (!parsed.success) {
      const fieldErrors = zodFieldErrors(parsed.error, FIELD_LABELS);
      setErrors(fieldErrors);
      toast.error(Object.values(fieldErrors)[0] ?? 'Verifique os campos do formulário');
      return;
    }
    setErrors({});
    try {
      await update.mutateAsync(parsed.data);
      toast.success('Configurações atualizadas');
    } catch (err) {
      toast.error(apiErrorMessage(err, FIELD_LABELS));
    }
  }

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Site público</h1>
          <p className="text-muted-foreground">
            Edite o conteúdo do site da oficina e cadastre categorias usadas nos clientes.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/site" target="_blank">Ver site <ExternalLink className="size-4" /></Link>
        </Button>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-card p-4">
        <input
          id="published"
          type="checkbox"
          className="size-4"
          checked={published}
          onChange={(e) => setPublished(e.target.checked)}
        />
        <label htmlFor="published" className="text-sm font-medium">
          Site publicado (visível ao público)
        </label>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.full ? 'sm:col-span-2' : ''}`}>
            <Label required={f.required}>{f.label}</Label>
            {f.key === 'logoUrl' || f.key === 'logoPdfUrl' ? (
              <ImageUpload value={form[f.key] ?? ''} onChange={(url) => setField(f.key, url)} />
            ) : f.area ? (
              <Textarea
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                rows={f.key === 'about' ? 4 : 3}
              />
            ) : (
              <Input
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                inputMode={f.key === 'phone' || f.key === 'whatsapp' ? 'tel' : f.key === 'cnpj' ? 'numeric' : undefined}
                maxLength={f.key === 'phone' || f.key === 'whatsapp' ? 15 : f.key === 'cnpj' ? 18 : undefined}
                placeholder={f.key === 'phone' || f.key === 'whatsapp' ? '(00) 00000-0000' : f.key === 'cnpj' ? '00.000.000/0000-00' : undefined}
              />
            )}
            {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
          </div>
        ))}
      </div>

      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="text-lg font-semibold">Categorias de clientes</h2>
          <p className="text-sm text-muted-foreground">
            Cadastre aqui as opções que aparecem no dropdown de categorias do cadastro de cliente.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1 space-y-1.5">
            <Label>Nova categoria</Label>
            <Input
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCategory();
                }
              }}
              maxLength={40}
              placeholder="Ex.: VIP, Frota, Particular, Empresa"
            />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={addCategory}>
              <Plus className="size-4" />
              Adicionar
            </Button>
          </div>
        </div>

        {errors.customerCategories && (
          <p className="text-xs text-destructive">{errors.customerCategories}</p>
        )}

        {sortedCustomerCategories.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {sortedCustomerCategories.map((category) => (
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
        ) : (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            Nenhuma categoria cadastrada. O dropdown do cliente ficará vazio até você adicionar uma opção.
          </p>
        )}
      </div>

      <Button onClick={save} disabled={update.isPending}>
        {update.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
        Salvar
      </Button>
    </div>
  );
}
