'use client';

import Link from 'next/link';
import {
  Globe,
  MessageSquare,
  Users,
  Sparkles,
  ShieldCheck,
  MonitorSmartphone,
  BarChart3,
  Bell,
  Gauge,
  Tags,
  Repeat,
  Network,
  CreditCard,
  Building2,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { Card, CardContent } from '@/components/ui/card';

interface Item {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  permission?: string;
}

const ITEMS: Item[] = [
  {
    title: 'Site público',
    description: 'Dados da oficina, capacidade, logo e textos.',
    href: '/site-config',
    icon: Globe,
    permission: 'site:manage',
  },
  {
    title: 'Domínios próprios',
    description: 'Domínios que apontam para o site desta oficina.',
    href: '/configuracoes/dominios',
    icon: Network,
    permission: 'settings:manage',
  },
  {
    title: 'Categorias',
    description: 'Categorias de clientes, serviços e peças.',
    href: '/categorias',
    icon: Tags,
    permission: 'settings:manage',
  },
  {
    title: 'Mensagens',
    description: 'Templates, variáveis e eventos automáticos.',
    href: '/mensagens',
    icon: MessageSquare,
    permission: 'messages:read',
  },
  {
    title: 'CRM pós-venda',
    description: 'Regras de revisão, inatividade, campanhas e retenção.',
    href: '/configuracoes/crm',
    icon: Repeat,
    permission: 'settings:manage',
  },
  {
    title: 'Operação diária',
    description: 'Regras do dashboard operacional, alertas e inbox.',
    href: '/configuracoes/operacional',
    icon: Gauge,
    permission: 'settings:manage',
  },
  {
    title: 'Usuários e permissões',
    description: 'Funcionários, perfis e acessos.',
    href: '/usuarios',
    icon: Users,
    permission: 'users:read',
  },

  {
    title: 'Minhas oficinas',
    description: 'Matriz e filiais: renomear e adicionar oficinas conforme o plano.',
    href: '/configuracoes/oficinas',
    icon: Building2,
    permission: 'settings:manage',
  },
  {
    title: 'Plano e quotas',
    description: 'Uso do plano atual, limites e consumo mensal.',
    href: '/configuracoes/plano',
    icon: CreditCard,
    permission: 'dashboard:read',
  },
  {
    title: 'Segurança e sessões',
    description: 'Dispositivos conectados, revogação de sessão e logout global.',
    href: '/configuracoes/sessoes',
    icon: MonitorSmartphone,
  },
  {
    title: 'Assistente de IA',
    description: 'Provedor, chave de API e instruções.',
    href: '/ia',
    icon: Sparkles,
    permission: 'ai:manage',
  },
  {
    title: 'Relatórios',
    description: 'Faturamento, OS por status e rankings.',
    href: '/relatorios',
    icon: BarChart3,
    permission: 'dashboard:read',
  },
  {
    title: 'Auditoria',
    description: 'Histórico de eventos e alterações.',
    href: '/auditoria',
    icon: ShieldCheck,
    permission: 'audit:read',
  },
  {
    title: 'Notificações',
    description: 'Push do navegador (PWA) e avisos.',
    href: '/notificacoes',
    icon: Bell,
  },
];

export default function ConfiguracoesPage() {
  const { hasPermission } = useAuth();
  const items = ITEMS.filter((i) => !i.permission || hasPermission(i.permission));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-muted-foreground">Ajustes do sistema e da oficina.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => {
          const Icon = i.icon;
          return (
            <Link key={i.href} href={i.href}>
              <Card className="h-full transition-colors hover:border-primary">
                <CardContent className="flex items-start gap-3 p-5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1 font-medium">
                      {i.title} <ArrowRight className="size-3.5 text-muted-foreground" />
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">{i.description}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
