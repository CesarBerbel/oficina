'use client';

import { useRef, useState } from 'react';
import { Upload, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/features/uploads/upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Campo de imagem: faz upload (gera URL) ou aceita uma URL colada.
 * Mostra prévia da imagem atual.
 */
export function ImageUpload({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    setBusy(true);
    try {
      const url = await uploadImage(file);
      onChange(url);
      toast.success('Imagem enviada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="URL da imagem ou envie um arquivo"
          className="flex-1"
        />
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
        <Button type="button" variant="outline" size="icon" className="shrink-0" disabled={busy} onClick={() => ref.current?.click()} aria-label="Enviar imagem">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        </Button>
        {value && (
          <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={() => onChange('')} aria-label="Remover">
            <X className="size-4" />
          </Button>
        )}
      </div>
      {value && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="prévia" className="h-24 rounded-lg border object-cover" />
      )}
    </div>
  );
}
