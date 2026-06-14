import {
  LayoutDashboard,
  Gauge,
  BellRing,
  ListChecks,
  Users,
  Car,
  ClipboardCheck,
  ClipboardList,
  KanbanSquare,
  Wrench,
  PackageCheck,
  Package,
  ShoppingCart,
  FileInput,
  Inbox,
  BarChart3,
  HeartHandshake,
  Newspaper,
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { Permission } from '@oficina/shared';

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permissão necessária para ver o item (undefined = sempre visível). */
  permission?: string;
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

/**
 * Menu lateral por seções. Itens de configuração (mensagens, blog, site,
 * usuários, IA, auditoria) NÃO ficam aqui — são acessados pelo hub /configuracoes.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Atendimento',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, permission: Permission.DASHBOARD_READ },
      { label: 'Operacional', href: '/operacional', icon: Gauge, permission: Permission.DASHBOARD_READ },
      { label: 'Inbox', href: '/central-notificacoes', icon: BellRing },
      { label: 'Central de ações', href: '/central-acoes', icon: ListChecks, permission: Permission.DASHBOARD_READ },
      { label: 'Clientes', href: '/clientes', icon: Users, permission: Permission.CUSTOMERS_READ },
      { label: 'Veículos', href: '/veiculos', icon: Car, permission: Permission.VEHICLES_READ },
      { label: 'Check-in', href: '/check-in', icon: ClipboardCheck, permission: Permission.VEHICLES_READ },
      { label: 'Ordens de Serviço', href: '/os', icon: ClipboardList, permission: Permission.OS_READ },
      { label: 'Kanban Técnico', href: '/kanban', icon: KanbanSquare, permission: Permission.OS_READ },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      { label: 'Serviços', href: '/servicos', icon: Wrench, permission: Permission.SERVICES_READ },
      { label: 'Combos', href: '/combos', icon: PackageCheck, permission: Permission.SERVICES_READ },
    ],
  },
  {
    label: 'Estoque & Compras',
    items: [
      { label: 'Estoque', href: '/estoque', icon: Package, permission: Permission.INVENTORY_READ },
      { label: 'Importar NF-e', href: '/nfe-import', icon: FileInput, permission: Permission.NFE_IMPORT },
      { label: 'Compras', href: '/compras', icon: ShoppingCart, permission: Permission.PURCHASES_READ },
    ],
  },
  {
    label: 'Gestão',
    items: [
      { label: 'Recepção', href: '/leads', icon: Inbox, permission: Permission.CUSTOMERS_READ },
      { label: 'CRM Pós-venda', href: '/crm', icon: HeartHandshake, permission: Permission.CUSTOMERS_READ },
      { label: 'Blog', href: '/blog', icon: Newspaper, permission: Permission.BLOG_WRITE },
      { label: 'Relatórios', href: '/relatorios', icon: BarChart3, permission: Permission.DASHBOARD_READ },
    ],
  },
  {
    label: 'Sistema',
    items: [{ label: 'Configurações', href: '/configuracoes', icon: Settings }],
  },
];
