'use client';

import { useRef, useState } from 'react';
import { Camera, ImagePlus, X } from 'lucide-react';
import { CarLoader } from '@/components/car-loader';
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
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
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy || value.length >= max}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Camera className="size-4" />
          Tirar foto
        </button>
        <button
          type="button"
          onClick={() => galleryRef.current?.click()}
          disabled={busy || value.length >= max}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ImagePlus className="size-4" />
          Enviar da galeria
        </button>
      </div>

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
          onClick={() => galleryRef.current?.click()}
          disabled={busy}
          className="grid aspect-square place-items-center rounded-lg border border-dashed text-muted-foreground transition hover:border-foreground hover:text-foreground"
        >
          {busy ? (
            <CarLoader className="size-5 animate-spin" />
          ) : (
            <ImagePlus className="size-5" />
          )}
        </button>
      )}
      </div>

      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galleryRef}
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
