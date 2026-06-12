'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Save } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
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
  { key: 'heroImageUrl', label: 'Imagem de fundo do hero (home)', full: true },
  { key: 'about', label: 'Sobre — resumo (aparece na home e no topo do Sobre)', area: true, full: true },
  { key: 'aboutExtra', label: 'Sobre — texto complementar (abaixo do resumo, só no Sobre)', area: true, full: true },
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
  { key: 'blogFallbackImageUrl', label: 'Imagem padrão do blog (artigos sem imagem)', full: true },
  { key: 'serviceCardImageUrl', label: 'Imagem dos cards de serviço (site público)', full: true },
  { key: 'pdfFooterText', label: 'Rodapé do PDF', area: true, full: true },
  { key: 'capacity', label: 'Capacidade da oficina (OS simultâneas)' },
  { key: 'mapsEmbed', label: 'Google Maps (código embed)', area: true, full: true },
];

const FIELD_LABELS = Object.fromEntries(
  FIELDS.map((field) => [field.key, field.label.replace(' (opcional)', '')]),
) as Record<string, string>;

export default function SiteConfigPage() {
  const { data, isLoading } = useSiteSettings();
  const update = useUpdateSiteSettings();
  const [form, setForm] = useState<Record<string, string>>({});
  const [published, setPublished] = useState(false);
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
      setErrors({});
    }
  }, [data]);

  function setField(key: string, value: string) {
    const masked =
      key === 'phone' || key === 'whatsapp'
        ? maskPhone(value)
        : key === 'cnpj'
          ? maskCnpj(value)
          : value;
    setForm((current) => ({ ...current, [key]: masked }));
  }

  async function save() {
    const payload = {
      ...form,
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
            {f.key === 'logoUrl' || f.key === 'logoPdfUrl' || f.key === 'blogFallbackImageUrl' || f.key === 'serviceCardImageUrl' || f.key === 'heroImageUrl' ? (
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

      <Button onClick={save} disabled={update.isPending}>
        {update.isPending ? <CarLoader className="size-4 animate-spin" /> : <Save className="size-4" />}
        Salvar
      </Button>
    </div>
  );
}
