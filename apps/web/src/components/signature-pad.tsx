'use client';

import { useEffect, useRef, useState } from 'react';
import { Eraser, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadImage } from '@/features/uploads/upload';
import { Button } from '@/components/ui/button';

/**
 * Coleta a assinatura do responsável num canvas. Ao salvar, exporta o desenho
 * como PNG, envia via /uploads e devolve a URL pública por onChange.
 * Aceita ponteiro (mouse), toque e caneta.
 */
export function SignaturePad({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width,
      y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height,
    };
  }

  function start(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  }

  function end() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    onChange('');
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!dirty.current) {
      toast.error('Assine no quadro antes de salvar.');
      return;
    }
    setBusy(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/png'),
      );
      if (!blob) throw new Error('Falha ao gerar a assinatura');
      const file = new File([blob], 'assinatura.png', { type: 'image/png' });
      const url = await uploadImage(file);
      onChange(url);
      toast.success('Assinatura salva');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="space-y-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Assinatura"
          className="h-32 w-full rounded-lg border bg-white object-contain"
        />
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="size-4" /> Refazer assinatura
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="h-40 w-full touch-none rounded-lg border bg-white"
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="size-4" /> Limpar
        </Button>
        <Button type="button" size="sm" disabled={busy} onClick={save}>
          {busy && <Loader2 className="size-4 animate-spin" />} Salvar assinatura
        </Button>
      </div>
    </div>
  );
}
