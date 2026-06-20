'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { AuthUser, LoginResponse, Permission } from '@oficina/shared';
import { api, setAccessToken, API_URL } from './api';

type Status = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  user: AuthUser | null;
  status: Status;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  hasPermission: (permission: Permission | string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const AUTH_CHANNEL = 'oficina-auth-session';
type AuthChannelEvent = { type: 'login' | 'logout' | 'session-refreshed'; at: number };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [status, setStatus] = useState<Status>('loading');
  const channelRef = useRef<BroadcastChannel | null>(null);
  // Sela cada mudança autoritativa de sessão (login/logout). Um restoreSession em
  // voo que resolva depois é descartado — evita o bootstrap (refresh sem cookie =
  // 401) sobrescrever um login recém-concluído e rebater para /login.
  const authEpoch = useRef(0);

  const restoreSession = useCallback(async (active: () => boolean = () => true) => {
    const epoch = authEpoch.current;
    const fresh = () => active() && epoch === authEpoch.current;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!fresh()) return;
      if (res.ok) {
        const data = (await res.json()) as LoginResponse;
        if (!fresh()) return;
        setAccessToken(data.accessToken);
        setUser(data.user);
        setStatus('authenticated');
      } else {
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    } catch {
      if (fresh()) {
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
      }
    }
  }, []);

  const broadcast = useCallback((type: AuthChannelEvent['type']) => {
    channelRef.current?.postMessage({ type, at: Date.now() } satisfies AuthChannelEvent);
  }, []);

  // Bootstrap: tenta restaurar a sessão a partir do cookie de refresh.
  useEffect(() => {
    let active = true;
    void restoreSession(() => active);
    return () => {
      active = false;
    };
  }, [restoreSession]);

  // Sincroniza login/logout entre abas sem trafegar access token por storage/canal.
  useEffect(() => {
    if (typeof window === 'undefined' || !('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel(AUTH_CHANNEL);
    channelRef.current = channel;
    channel.onmessage = (event: MessageEvent<AuthChannelEvent>) => {
      if (event.data?.type === 'logout') {
        setAccessToken(null);
        setUser(null);
        setStatus('unauthenticated');
        return;
      }
      if (event.data?.type === 'login' || event.data?.type === 'session-refreshed') {
        void restoreSession();
      }
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) channelRef.current = null;
    };
  }, [restoreSession]);

  const login = useCallback(
    async (email: string, password: string, tenantSlug?: string) => {
      const data = await api.post<LoginResponse>(
        '/auth/login',
        // tenantSlug só vai no apex/dev; no subdomínio a conta vem do host.
        { email, password, ...(tenantSlug ? { tenantSlug } : {}) },
        { skipAuthRetry: true },
      );
      authEpoch.current += 1; // login é autoritativo: descarta restoreSession em voo
      setAccessToken(data.accessToken);
      setUser(data.user);
      setStatus('authenticated');
      broadcast('login');
    },
    [broadcast],
  );

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignora erro de logout */
    }
    authEpoch.current += 1; // logout é autoritativo: descarta restoreSession em voo
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    broadcast('logout');
  }, [broadcast]);

  const logoutAll = useCallback(async () => {
    try {
      await api.post('/auth/logout-all');
    } catch {
      /* ignora erro de logout global */
    }
    authEpoch.current += 1; // logout é autoritativo: descarta restoreSession em voo
    setAccessToken(null);
    setUser(null);
    setStatus('unauthenticated');
    broadcast('logout');
  }, [broadcast]);

  const hasPermission = useCallback(
    (permission: Permission | string) => user?.permissions?.includes(permission as string) ?? false,
    [user],
  );

  const value = useMemo(
    () => ({ user, status, login, logout, logoutAll, hasPermission }),
    [user, status, login, logout, logoutAll, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
