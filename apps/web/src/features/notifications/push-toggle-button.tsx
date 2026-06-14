'use client';

import { useEffect, useState } from 'react';
import { BellOff, BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { CarLoader } from '@/components/car-loader';
import {
  currentNotificationPermission,
  disablePush,
  enablePush,
  isPushEnabled,
  pushSupported,
} from './push';

export function PushToggleButton() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    'unsupported',
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ok = pushSupported();
    setSupported(ok);
    setPermission(currentNotificationPermission());
    if (ok) {
      isPushEnabled().then(setEnabled).catch(() => setEnabled(false));
    }
  }, []);

  if (!supported) return null;

  async function toggle() {
    setBusy(true);
    try {
      if (enabled) {
        await disablePush();
        setEnabled(false);
        toast.success('Notificações push desativadas neste dispositivo');
      } else {
        await enablePush();
        setEnabled(true);
        setPermission(currentNotificationPermission());
        toast.success('Notificações push ativadas neste dispositivo');
      }
    } catch (err) {
      setPermission(currentNotificationPermission());
      toast.error(err instanceof Error ? err.message : 'Falha ao configurar push');
    } finally {
      setBusy(false);
    }
  }

  const blocked = permission === 'denied';
  const label = blocked
    ? 'Push bloqueado no navegador'
    : enabled
      ? 'Desativar push neste dispositivo'
      : 'Ativar push neste dispositivo';

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={busy || blocked}
      aria-label={label}
      title={label}
    >
      {busy ? (
        <CarLoader className="size-5 animate-spin" />
      ) : enabled ? (
        <BellRing className="size-5 text-primary" />
      ) : (
        <BellOff className="size-5" />
      )}
    </Button>
  );
}
