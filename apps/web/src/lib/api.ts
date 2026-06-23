/**
 * Cliente HTTP da API. O access token vive em memória (não em localStorage,
 * por segurança). O refresh token é um cookie httpOnly gerenciado pelo backend.
 * Em caso de 401, tenta um refresh transparente uma vez e repete a requisição.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';

let accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Não tentar refresh em 401 (usado pelo próprio refresh/login). */
  skipAuthRetry?: boolean;
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, skipAuthRetry, ...rest } = options;

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: 'include',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && !skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      return rawRequest<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!res.ok) {
    let message = `Erro ${res.status}`;
    let details: unknown;
    try {
      const data = await res.json();
      details = data.details;
      if (Array.isArray(data.details) && data.details.length > 0) {
        message = data.details
          .map((detail: unknown) => {
            if (typeof detail !== 'object' || detail === null) return '';
            const record = detail as { path?: unknown; message?: unknown };
            const path = typeof record.path === 'string' && record.path ? record.path : 'Campo';
            const detailMessage =
              typeof record.message === 'string' ? record.message : 'valor inválido';
            return `${path}: ${detailMessage}`;
          })
          .filter(Boolean)
          .join('; ');
      } else {
        message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
      }
    } catch {
      /* resposta sem corpo JSON */
    }
    throw new ApiError(res.status, message, details);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) return false;
        const data = (await res.json()) as { accessToken: string };
        setAccessToken(data.accessToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

/** Abre um recurso binário autenticado (ex.: PDF) em nova aba. */
export async function openAuthedResource(path: string): Promise<void> {
  let res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401 && (await tryRefresh())) {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  }
  if (!res.ok) throw new ApiError(res.status, 'Falha ao gerar o arquivo');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Baixa um recurso binário autenticado forçando o "Salvar como" do navegador.
 * Usa o access token em memória (um `<a href>` direto não carrega o Bearer).
 */
export async function downloadAuthedResource(path: string, fallbackName: string): Promise<void> {
  let res = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (res.status === 401 && (await tryRefresh())) {
    res = await fetch(`${API_URL}${path}`, {
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
  }
  if (!res.ok) throw new ApiError(res.status, 'Falha ao gerar o arquivo');

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? fallbackName;

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function uploadAuthedFile(file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append('file', file);

  let res = await fetch(`${API_URL}/uploads`, {
    method: 'POST',
    credentials: 'include',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: form,
  });
  if (res.status === 401 && (await tryRefresh())) {
    res = await fetch(`${API_URL}/uploads`, {
      method: 'POST',
      credentials: 'include',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      body: form,
    });
  }
  if (!res.ok) {
    let message = 'Falha ao enviar arquivo';
    try {
      const data = await res.json();
      message = Array.isArray(data.message) ? data.message.join(', ') : (data.message ?? message);
    } catch {
      /* resposta sem JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<{ url: string }>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    rawRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    rawRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    rawRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    rawRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    rawRequest<T>(path, { ...options, method: 'DELETE' }),
};
