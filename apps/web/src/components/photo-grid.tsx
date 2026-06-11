'use client';

import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/features/uploads/upload';

/** Grade de fotos com upload múltiplo. Guarda apenas as URLs públicas. */
export function PhotoGrid({
  value,
  onChange,
  max = 30,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFiles(files: FileList) {
    const room = max - value.length;
    if (room <= 0) {
      toast.error(`Máximo de ${max} fotos.`);
      return;
    }
    setBusy(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const urls = await Promise.all(picked.map((f) => uploadImage(f)));
      onChange([...value, ...urls]);
      toast.success(picked.length > 1 ? 'Fotos enviadas' : 'Foto enviada');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha no upload');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
      {value.map((url) => (
        <div key={url} className="group relative aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt="Foto do veículo"
            className="h-full w-full rounded-lg border object-cover"
          />
          <button
            type="button"
            onClick={() => onChange(value.filter((u) => u !== url))}
            className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition group-hover:opacity-100"
            aria-label="Remover foto"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      {value.length < max && (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground transition hover:border-foreground hover:text-foreground"
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}
