'use client';

import { useState } from 'react';
import { Camera, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { ServiceOrderTechnicalChecklistItem } from '@oficina/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, uploadAuthedFile } from '@/lib/api';
import { useCreateTechnicalUpdate } from './use-service-orders';

type DraftChecklistItem = ServiceOrderTechnicalChecklistItem & { key: string };

const DEFAULT_ITEMS = [
  'Conferir vazamentos',
  'Conferir aperto/fixações',
  'Testar funcionamento',
];

export function OsTechnicalMobilePanel({
  osId,
  disabled,
}: {
  osId: string;
  disabled: boolean;
}) {
  const createUpdate = useCreateTechnicalUpdate(osId);
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [items, setItems] = useState<DraftChecklistItem[]>(() =>
    DEFAULT_ITEMS.map((item, index) => ({
      key: `${Date.now()}-${index}`,
      item,
      done: false,
    })),
  );

  function addItem() {
    setItems((current) => [
      ...current,
      { key: `${Date.now()}-${current.length}`, item: '', done: false },
    ]);
  }

  function updateItem(key: string, patch: Partial<DraftChecklistItem>) {
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );
  }

  function removeItem(key: string) {
    setItems((current) => current.filter((item) => item.key !== key));
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    try {
      const uploaded = [] as string[];
      for (const file of Array.from(files)) {
        const result = await uploadAuthedFile(file);
        uploaded.push(result.url);
      }
      setPhotos((current) => [...current, ...uploaded]);
      toast.success('Foto adicionada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao enviar foto');
    }
  }

  async function submit() {
    const checklist = items
      .map(({ item, done, note }) => ({ item: item.trim(), done, note }))
      .filter((item) => item.item.length > 0);

    if (!description.trim() && checklist.length === 0 && photos.length === 0) {
      toast.error('Informe uma nota, checklist ou foto.');
      return;
    }

    try {
      await createUpdate.mutateAsync({
        description: description.trim() || undefined,
        public: isPublic,
        checklist,
        photos,
      });
      setDescription('');
      setPhotos([]);
      setIsPublic(false);
      setItems((current) => current.map((item) => ({ ...item, done: false, note: '' })));
      toast.success('Atualização técnica registrada');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Erro ao registrar atualização');
    }
  }

  return (
    <Card className="lg:sticky lg:top-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Modo técnico mobile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Descreva o que foi feito, testes realizados ou pendências..."
          rows={3}
          disabled={disabled}
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Checklist rápido</p>
            <Button type="button" size="sm" variant="outline" onClick={addItem} disabled={disabled}>
              <Plus className="size-4" /> Item
            </Button>
          </div>
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.key} className="rounded-lg border p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={(event) => updateItem(item.key, { done: event.target.checked })}
                    disabled={disabled}
                    className="size-4"
                  />
                  <Input
                    value={item.item}
                    onChange={(event) => updateItem(item.key, { item: event.target.value })}
                    placeholder="Item do checklist"
                    disabled={disabled}
                    className="h-8"
                  />
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeItem(item.key)}
                    disabled={disabled}
                    aria-label="Remover item"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <Input
                  value={item.note ?? ''}
                  onChange={(event) => updateItem(item.key, { note: event.target.value })}
                  placeholder="Observação do item (opcional)"
                  disabled={disabled}
                  className="mt-2 h-8"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Fotos do serviço</p>
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-sm text-muted-foreground">
            <Camera className="size-5" />
            Toque para enviar fotos
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              disabled={disabled}
              onChange={(event) => onFiles(event.target.files)}
            />
          </label>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((url) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setPhotos((current) => current.filter((item) => item !== url))}
                  className="overflow-hidden rounded-md border"
                  title="Remover foto"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="Foto enviada" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(event) => setIsPublic(event.target.checked)}
            disabled={disabled}
            className="size-4"
          />
          Visível para o cliente na consulta pública
        </label>

        <Button className="w-full" onClick={submit} disabled={disabled || createUpdate.isPending}>
          <Save className="size-4" /> Registrar atualização
        </Button>
      </CardContent>
    </Card>
  );
}
