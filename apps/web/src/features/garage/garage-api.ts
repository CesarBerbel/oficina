'use client';

import type {
  GarageDataDto,
  GarageRequestCodeResult,
  GarageSessionDto,
} from '@oficina/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
const SITE_TENANT_SLUG = process.env.NEXT_PUBLIC_SITE_TENANT_SLUG;
const TOKEN_KEY = 'garage_token';

export function getGarageToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setGarageToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
  else sessionStorage.removeItem(TOKEN_KEY);
}

function publicHeaders(): Record<string, string> {
  return {
    'X-Public-Host': window.location.host,
    ...(SITE_TENANT_SLUG ? { 'X-Public-Tenant-Slug': SITE_TENANT_SLUG } : {}),
  };
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...publicHeaders() },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = 'Não foi possível concluir a solicitação.';
    try {
      const data = await res.json();
      msg = data.message ?? msg;
    } catch {
      /* sem corpo */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const requestGarageCode = (plate: string) =>
  postJson<GarageRequestCodeResult>('/public/garage/request-code', { plate });

export const verifyGarageCode = (plate: string, code: string) =>
  postJson<GarageSessionDto>('/public/garage/verify', { plate, code });

/** Erros padronizados para o consumo na página da garagem. */
export const GARAGE_NO_SESSION = 'SEM_SESSAO';

export async function fetchGarageData(): Promise<GarageDataDto> {
  const token = getGarageToken();
  if (!token) throw new Error(GARAGE_NO_SESSION);
  const res = await fetch(`${API_URL}/public/garage`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    setGarageToken(null);
    throw new Error(GARAGE_NO_SESSION);
  }
  if (!res.ok) throw new Error('Erro ao carregar o histórico do veículo.');
  return res.json() as Promise<GarageDataDto>;
}
