'use client';

import { useRouter } from 'next/navigation';
import { KeyRound, Menu, LogOut } from 'lucide-react';
import { USER_ROLE_LABELS, type UserRole } from '@oficina/shared';
import { useAuth } from '@/lib/auth-context';
import { NotificationBell } from '@/features/notifications/notification-bell';
import { GlobalSearchDialog } from '@/features/global-search/global-search-dialog';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function AppTopbar({ onMenu }: { onMenu?: () => void }) {
  const router = useRouter();
  const { user, logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.replace('/login');
  }

  const initials = (user?.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <header className="flex h-16 items-center gap-2 border-b bg-card/60 px-4 backdrop-blur">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        onClick={onMenu}
        aria-label="Abrir menu"
      >
        <Menu className="size-5" />
      </Button>

      <div className="flex-1" />

      <GlobalSearchDialog />

      <NotificationBell />

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-full p-1 pr-3 transition-colors hover:bg-accent">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium leading-tight">{user?.name}</span>
              <span className="block text-xs text-muted-foreground">
                {user ? USER_ROLE_LABELS[user.role as UserRole] : ''}
              </span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-medium">{user?.name}</div>
            <div className="text-xs font-normal text-muted-foreground">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/trocar-senha')}>
            <KeyRound className="size-4" />
            Trocar senha
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="size-4" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
