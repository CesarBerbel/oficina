import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '../../../../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('arquivos de deploy e headers de segurança', () => {
  it('mantém Caddyfile parametrizado por PLATFORM_BASE_DOMAIN, sem domínio fixo', () => {
    const caddyfile = readRepoFile('docker/caddy/Caddyfile');

    expect(caddyfile).toContain('{$PLATFORM_BASE_DOMAIN}');
    expect(caddyfile).toContain('www.{$PLATFORM_BASE_DOMAIN}');
    expect(caddyfile).toContain('*.{$PLATFORM_BASE_DOMAIN}');
    expect(caddyfile).not.toContain('saecbpa.com {');
  });

  it('mantém lint do build Docker web habilitado por padrão', () => {
    const dockerfile = readRepoFile('docker/Dockerfile.web');

    expect(dockerfile).toContain('ARG NEXT_DISABLE_ESLINT_DURING_BUILD=false');
    expect(dockerfile).toContain(
      'ENV NEXT_DISABLE_ESLINT_DURING_BUILD=$NEXT_DISABLE_ESLINT_DURING_BUILD',
    );
  });

  it('mantém headers HTTP básicos no Next.js', () => {
    const nextConfig = readRepoFile('apps/web/next.config.mjs');

    expect(nextConfig).toContain("key: 'X-Content-Type-Options'");
    expect(nextConfig).toContain("value: 'nosniff'");
    expect(nextConfig).toContain("key: 'X-Frame-Options'");
    expect(nextConfig).toContain("key: 'Referrer-Policy'");
    expect(nextConfig).toContain("key: 'Permissions-Policy'");
  });
});
