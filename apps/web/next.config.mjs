import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const disableLintDuringBuild = process.env.NEXT_DISABLE_ESLINT_DURING_BUILD === 'true';

const nextConfig = {
  reactStrictMode: true,
  // Build "standalone": o Next rastreia (file-tracing) só os arquivos realmente
  // usados em runtime e gera apps/web/.next/standalone com um node_modules mínimo.
  // Evita copiar o node_modules hoisted inteiro do monorepo para a imagem.
  output: 'standalone',
  // Raiz do monorepo: garante que o tracing inclua workspace deps (@oficina/shared).
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: {
    // Em produção o lint não deve bloquear o deploy.
    // O typecheck continua sendo executado pelo Next.js/CI.
    ignoreDuringBuilds: disableLintDuringBuild,
  },
  // Consome o pacote compartilhado já compilado (dist). transpilePackages
  // garante HMR/resolução correta dentro do monorepo.
  transpilePackages: ['@oficina/shared'],
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  async rewrites() {
    const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333/api';
    return [
      // Proxy opcional para evitar CORS em dev: /api-proxy/* -> API
      { source: '/api-proxy/:path*', destination: `${api}/:path*` },
    ];
  },
};

export default nextConfig;
