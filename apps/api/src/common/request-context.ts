import { AsyncLocalStorage } from 'node:async_hooks';

/** Dados do request propagados via AsyncLocalStorage (sem precisar passar req). */
export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
}

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}
