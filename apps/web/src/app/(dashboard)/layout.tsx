'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CarLoader } from '@/components/car-loader';
import { useAuth } from '@/lib/auth-context';
import { AppSidebar } from '@/components/app-sidebar';
import { AppTopbar } from '@/components/app-topbar';
import { cn } from '@/lib/utils';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { status } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <div className="grid min-h-dvh place-items-center">
        <CarLoader className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[260px_1fr]">
      {/* Sidebar desktop */}
      <aside className="hidden border-r bg-card/40 lg:block">
        <div className="sticky top-0 h-dvh">
          <AppSidebar />
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <aside
            className={cn(
              'absolute left-0 top-0 h-full w-72 border-r bg-card shadow-xl',
            )}
          >
            <AppSidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-h-dvh flex-col">
        <AppTopbar onMenu={() => setMobileOpen(true)} />
        <main className="min-h-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
