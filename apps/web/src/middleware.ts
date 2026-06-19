import { NextResponse, type NextRequest } from 'next/server';

const AUTH_COOKIE_NAME =
  process.env.NEXT_PUBLIC_AUTH_COOKIE_NAME ?? process.env.AUTH_COOKIE_NAME ?? 'oficina_rt';

const PROTECTED_PREFIXES = [
  '/auditoria',
  '/blog',
  '/categorias',
  '/central-acoes',
  '/central-notificacoes',
  '/check-in',
  '/clientes',
  '/combos',
  '/compras',
  '/configuracoes',
  '/contas',
  '/crm',
  '/dashboard',
  '/estoque',
  '/financeiro',
  '/ia',
  '/kanban',
  '/leads',
  '/mensagens',
  '/metricas',
  '/nfe-import',
  '/notificacoes',
  '/oficinas',
  '/operacional',
  '/os',
  '/plataforma',
  '/relatorios',
  '/servicos',
  '/site-config',
  '/trocar-senha',
  '/usuarios',
  '/veiculos',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isProtected(pathname)) return NextResponse.next();

  const refreshCookie = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (refreshCookie) {
    const response = NextResponse.next();
    response.headers.set('x-auth-guard', 'cookie-present');
    return response;
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|uploads).*)'],
};
