'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Save, Search } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
import { toast } from 'sonner';
import { updateSiteSettingsSchema } from '@oficina/shared';
import { apiErrorMessage, zodFieldErrors } from '@/lib/form-errors';
import { useSiteSettings, useUpdateSiteSettings } from '@/features/content/use-content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { ImageUpload } from '@/components/image-upload';
import { maskCep, maskCnpj, maskPhone, onlyDigits } from '@/lib/masks';

const FIELDS: { key: string; label: string; area?: boolean; full?: boolean; required?: boolean }[] =
  [
    { key: 'shopName', label: 'Nome da oficina', required: true },
    { key: 'tagline', label: 'Slogan' },
    { key: 'heroTitle', label: 'Título da home' },
    { key: 'heroSubtitle', label: 'Subtítulo da home', full: true },
    { key: 'heroImageUrl', label: 'Imagem de fundo do hero (home)', full: true },
    {
      key: 'about',
      label: 'Sobre — resumo (aparece na home e no topo do Sobre)',
      area: true,
      full: true,
    },
    {
      key: 'aboutExtra',
      label: 'Sobre — texto complementar (abaixo do resumo, só no Sobre)',
      area: true,
      full: true,
    },
    { key: 'phone', label: 'Telefone' },
    { key: 'whatsapp', label: 'WhatsApp' },
    { key: 'email', label: 'E-mail' },
    { key: 'cnpj', label: 'CNPJ (opcional)' },
    { key: 'hours', label: 'Horários' },
    { key: 'instagram', label: 'Instagram (URL)' },
    { key: 'facebook', label: 'Facebook (URL)' },
    { key: 'logoUrl', label: 'Logo (URL)' },
    { key: 'logoPdfUrl', label: 'Logo para PDF (URL)' },
    {
      key: 'blogFallbackImageUrl',
      label: 'Imagem padrão do blog (artigos sem imagem)',
      full: true,
    },
    { key: 'serviceCardImageUrl', label: 'Imagem dos cards de serviço (site público)', full: true },
    { key: 'capacity', label: 'Capacidade da oficina (OS simultâneas)' },
    { key: 'mapsEmbed', label: 'Google Maps (código embed)', area: true, full: true },
  ];

const ADDRESS_FIELDS: { key: string; label: string; className?: string }[] = [
  { key: 'addressStreet', label: 'Rua / Logradouro', className: 'sm:col-span-4' },
  { key: 'addressNumber', label: 'Número', className: 'sm:col-span-2' },
  { key: 'addressComplement', label: 'Complemento', className: 'sm:col-span-3' },
  { key: 'addressDistrict', label: 'Bairro', className: 'sm:col-span-3' },
  { key: 'addressCity', label: 'Cidade', className: 'sm:col-span-4' },
  { key: 'addressState', label: 'UF', className: 'sm:col-span-2' },
];

const ALL_KEYS = [
  ...FIELDS.map((f) => f.key),
  'addressZip',
  ...ADDRESS_FIELDS.map((f) => f.key),
  'pdfFooterText',
];

const FIELD_LABELS = Object.fromEntries([
  ...FIELDS.map((f) => [f.key, f.label.replace(' (opcional)', '')] as const),
  ['addressZip', 'CEP'] as const,
  ...ADDRESS_FIELDS.map((f) => [f.key, f.label] as const),
  ['pdfFooterText', 'Rodapé do PDF'] as const,
]) as Record<string, string>;

export default function SiteConfigPage() {
  const { data, isLoading } = useSiteSettings();
  const update = useUpdateSiteSettings();
  const [form, setForm] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cepLoading, setCepLoading] = useState(false);

  useEffect(() => {
    if (data) {
      const f: Record<string, string> = {};
      const rec = data as unknown as Record<string, unknown>;
      for (const key of ALL_KEYS) {
        const value = rec[key]?.toString() ?? '';
        if (key === 'phone' || key === 'whatsapp') f[key] = maskPhone(value);
        else if (key === 'cnpj') f[key] = maskCnpj(value);
        else if (key === 'addressZip') f[key] = maskCep(value);
        else f[key] = value;
      }
      setForm(f);
      setPublished(data.published);
      setDarkMode(data.darkMode);
      setErrors({});
    }
  }, [data]);

  function setField(key: string, value: string) {
    const masked =
      key === 'phone' || key === 'whatsapp'
        ? maskPhone(value)
        : key === 'cnpj'
          ? maskCnpj(value)
          : key === 'addressZip'
            ? maskCep(value)
            : value;
    setForm((current) => ({ ...current, [key]: masked }));
  }

  async function lookupCep() {
    const cep = onlyDigits(form.addressZip);
    if (cep.length !== 8) {
      setErrors((c) => ({ ...c, addressZip: 'CEP: informe um CEP com 8 dígitos' }));
      return;
    }
    setCepLoading(true);
    setErrors((c) => ({ ...c, addressZip: '' }));
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!res.ok) throw new Error('CEP inválido');
      const d = (await res.json()) as {
        erro?: boolean;
        cep?: string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };
      if (d.erro) {
        setErrors((c) => ({ ...c, addressZip: 'CEP: CEP não encontrado' }));
        return;
      }
      setForm((current) => ({
        ...current,
        addressZip: maskCep(d.cep ?? cep),
        addressStreet: d.logradouro || current.addressStreet || '',
        addressDistrict: d.bairro || current.addressDistrict || '',
        addressCity: d.localidade || current.addressCity || '',
        addressState: d.uf || current.addressState || '',
      }));
      toast.success('Endereço preenchido pelo CEP');
    } catch {
      setErrors((c) => ({ ...c, addressZip: 'CEP: não foi possível consultar o CEP' }));
    } finally {
      setCepLoading(false);
    }
  }

  async function save() {
    const payload = { ...form, published, darkMode };
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
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
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
          <Link href="/site" target="_blank">
            Ver site <ExternalLink className="size-4" />
          </Link>
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

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Tema do site público</p>
          <p className="text-xs text-muted-foreground">Como os visitantes veem o seu site.</p>
        </div>
        <Select
          aria-label="Tema do site público"
          value={darkMode ? 'dark' : 'light'}
          onChange={(e) => setDarkMode(e.target.value === 'dark')}
          className="w-40"
        >
          <option value="light">Claro</option>
          <option value="dark">Escuro</option>
        </Select>
      </div>

      <div className="grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f.key} className={`space-y-1.5 ${f.full ? 'sm:col-span-2' : ''}`}>
            <Label required={f.required}>{f.label}</Label>
            {f.key === 'logoUrl' ||
            f.key === 'logoPdfUrl' ||
            f.key === 'blogFallbackImageUrl' ||
            f.key === 'serviceCardImageUrl' ||
            f.key === 'heroImageUrl' ? (
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
                inputMode={
                  f.key === 'phone' || f.key === 'whatsapp'
                    ? 'tel'
                    : f.key === 'cnpj'
                      ? 'numeric'
                      : undefined
                }
                maxLength={
                  f.key === 'phone' || f.key === 'whatsapp' ? 15 : f.key === 'cnpj' ? 18 : undefined
                }
                placeholder={
                  f.key === 'phone' || f.key === 'whatsapp'
                    ? '(00) 00000-0000'
                    : f.key === 'cnpj'
                      ? '00.000.000/0000-00'
                      : undefined
                }
              />
            )}
            {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
          </div>
        ))}
      </div>

      {/* Endereço estruturado */}
      <div className="space-y-3 rounded-xl border bg-card p-5">
        <h2 className="text-sm font-semibold">Endereço</h2>
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>CEP</Label>
            <div className="flex gap-2">
              <Input
                value={form.addressZip ?? ''}
                onChange={(e) => setField('addressZip', e.target.value)}
                inputMode="numeric"
                maxLength={9}
                placeholder="00000-000"
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
            {errors.addressZip && <p className="text-xs text-destructive">{errors.addressZip}</p>}
          </div>

          {ADDRESS_FIELDS.map((f) => (
            <div key={f.key} className={`space-y-1.5 ${f.className ?? ''}`}>
              <Label>{f.label}</Label>
              <Input
                value={form[f.key] ?? ''}
                onChange={(e) => setField(f.key, e.target.value)}
                maxLength={f.key === 'addressState' ? 2 : undefined}
                style={f.key === 'addressState' ? { textTransform: 'uppercase' } : undefined}
              />
              {errors[f.key] && <p className="text-xs text-destructive">{errors[f.key]}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Rodapé do PDF (rich text) */}
      <div className="space-y-2 rounded-xl border bg-card p-5">
        <div>
          <Label>Rodapé do PDF</Label>
          <p className="text-xs text-muted-foreground">
            Texto de condições/garantia impresso no fim da OS. Use a barra para negrito, itálico,
            sublinhado e listas.
          </p>
        </div>
        <RichTextEditor
          value={form.pdfFooterText ?? ''}
          onChange={(html) => setForm((c) => ({ ...c, pdfFooterText: html }))}
          placeholder="Ex.: Garantia de 90 dias para os serviços executados..."
        />
        {errors.pdfFooterText && <p className="text-xs text-destructive">{errors.pdfFooterText}</p>}
      </div>

      <Button onClick={save} disabled={update.isPending}>
        {update.isPending ? (
          <CarLoader className="size-4 animate-spin" />
        ) : (
          <Save className="size-4" />
        )}
        Salvar
      </Button>
    </div>
  );
}
