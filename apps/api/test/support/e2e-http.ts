import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { TENANT_SLUG, TEST_PASSWORD } from './e2e-db';

type SetCookieHeader = string | string[] | number | undefined;

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}

export function getCookie(setCookie: SetCookieHeader, name: string): string {
  const values = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === 'string'
      ? [setCookie]
      : [];

  const cookie = values.find((entry) => entry.startsWith(`${name}=`));
  if (!cookie) throw new Error(`Cookie ${name} não encontrado na resposta`);
  return cookie.split(';')[0];
}

export async function loginAs(
  app: INestApplication,
  input: {
    email?: string;
    password?: string;
    tenantSlug?: string;
  } = {},
): Promise<{ token: string; cookie: string; body: Record<string, unknown> }> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({
      tenantSlug: input.tenantSlug ?? TENANT_SLUG,
      email: input.email ?? 'admin@oficina.local',
      password: input.password ?? TEST_PASSWORD,
    })
    .expect(200);

  return {
    token: res.body.accessToken,
    cookie: getCookie(res.headers['set-cookie'], process.env.AUTH_COOKIE_NAME ?? 'oficina_e2e_rt'),
    body: res.body,
  };
}
