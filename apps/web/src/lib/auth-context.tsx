'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type {
  AuthUser,
  LoginResponse,
  Permission,
  RegisterTenantInput,
} from '@oficina/shared';
import { api, setAccessToken, API_URL } from './api';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: Status;
  login: (tenantSlug: string, email: string, password: string) => Promise<void>;
  register: (input: RegisterTenantInput) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: Permission | string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  // Bootstrap: tenta restaurar a sessão a partir do cookie de refresh.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!active) return;
        if (res.ok) {
          const data = (await res.json()) as LoginResponse;
          setAccessToken(data.accessToken);
          setUser(data.user);
          setStatus('authenticated');
        } else {
          setStatus('unauthenticated');
        }
      } catch {
        if (active) setStatus('unauthenticated');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (
    tenantSlug: string,
    email: string,
    password: string,
  ) => {
    const data = await api.post<LoginResponse>(
      '/auth/login',
      { tenantSlug, email, password },
      { skipAuthRetry: true },
    );
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const register = useCallback(async (input: RegisterTenantInput) => {
    const data = await api.post<LoginResponse>('/auth/register', input, {
      skipAuthRetry: true,
    });
    setAccessToken(data.accessToken);
    setUser(data.user);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignora erro de logout */
    }
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
  }, []);

  const hasPermission = useCallback(
    (permission: Permission | string) =>
      user?.permissions?.includes(permission as string) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, status, login, register, logout, hasPermission }),
    [user, status, login, register, logout, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
