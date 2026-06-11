/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
