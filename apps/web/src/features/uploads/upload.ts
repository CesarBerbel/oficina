'use client';

import { getAccessToken, API_URL } from '@/lib/api';

/** Faz upload de uma imagem e retorna a URL pública. */
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const token = getAccessToken();
  const res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    credentials: 'include',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) {
    let msg = 'Falha no upload';
    try {
      const d = await res.json();
      msg = d.message ?? msg;
    } catch {
      /* */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
