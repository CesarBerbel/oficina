'use client';

import { useQuery } from '@tanstack/react-query';
import type { BackupStatusDto } from '@oficina/shared';
import { api, downloadAuthedResource } from '@/lib/api';

export function useBackupStatus() {
  return useQuery({
    queryKey: ['platform-backup-status'],
    queryFn: () => api.get<BackupStatusDto>('/platform/backup/status'),
  });
}

/** Gera e baixa o backup (banco + uploads) num único .zip. */
export function downloadBackup(): Promise<void> {
  return downloadAuthedResource('/platform/backup/download', 'oficina_backup.zip');
}
