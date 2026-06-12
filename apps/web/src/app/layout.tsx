import type { Metadata, Viewport } from 'next';
import { Providers } from '@/components/providers';
import { getPublicSite } from '@/lib/public-api';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const data = await getPublicSite();
  const logo = data?.settings.logoUrl || null;
  const name = data?.settings.shopName || 'Oficina';
  return {
    title: {
      default: `${name} — Gestão`,
      template: `%s · ${name}`,
    },
    description: 'Sistema de gestão para oficina mecânica.',
    manifest: '/manifest.webmanifest',
    applicationName: name,
    appleWebApp: { capable: true, statusBarStyle: 'default', title: name },
    // Favicon baseado no logo cadastrado (quando houver).
    ...(logo ? { icons: { icon: logo, shortcut: logo, apple: logo } } : {}),
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1220' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
