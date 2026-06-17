import { z } from 'zod';

export type OperationalPriority = 'alta' | 'media' | 'baixa';
export type OperationalNotificationCategory =
  | 'recepcao'
  | 'oficina'
  | 'crm'
  | 'financeiro'
  | 'sistema';

export interface OperationalDashboardSettingsDto {
  appointmentLookaheadHours: number;
  waitingCustomerMinutes: number;
  stalledServiceOrderHours: number;
  pendingApprovalHours: number;
  crmHighPriorityLimit: number;
  enableAppointmentAlerts: boolean;
  enableWaitingCustomerAlerts: boolean;
  enableStalledOsAlerts: boolean;
  enablePendingApprovalAlerts: boolean;
  enableCrmAlerts: boolean;
}

export const updateOperationalSettingsSchema = z.object({
  appointmentLookaheadHours: z.coerce.number().int().min(1).max(72),
  waitingCustomerMinutes: z.coerce.number().int().min(5).max(480),
  stalledServiceOrderHours: z.coerce.number().int().min(1).max(720),
  pendingApprovalHours: z.coerce.number().int().min(1).max(720),
  crmHighPriorityLimit: z.coerce.number().int().min(1).max(100),
  enableAppointmentAlerts: z.boolean(),
  enableWaitingCustomerAlerts: z.boolean(),
  enableStalledOsAlerts: z.boolean(),
  enablePendingApprovalAlerts: z.boolean(),
  enableCrmAlerts: z.boolean(),
});
export type UpdateOperationalSettingsInput = z.infer<typeof updateOperationalSettingsSchema>;

export interface OperationalKpiDto {
  key: string;
  label: string;
  value: number;
  href: string;
  priority: OperationalPriority;
  description: string;
}

export interface OperationalAgendaItemDto {
  id: string;
  customerName: string;
  vehicleLabel: string | null;
  startAt: string;
  endAt: string | null;
  serviceType: string | null;
  status: string;
  href: string;
}

export interface OperationalAlertDto {
  id: string;
  title: string;
  description: string;
  category: OperationalNotificationCategory;
  priority: OperationalPriority;
  href: string;
  ageMinutes: number | null;
}

export interface OperationalDashboardDto {
  generatedAt: string;
  settings: OperationalDashboardSettingsDto;
  kpis: OperationalKpiDto[];
  upcomingArrivals: OperationalAgendaItemDto[];
  alerts: OperationalAlertDto[];
}

export interface NotificationInboxItemDto {
  id: string;
  type: string;
  category: OperationalNotificationCategory;
  priority: OperationalPriority;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
}

export interface NotificationInboxDto {
  generatedAt: string;
  unreadTotal: number;
  categories: Array<{
    category: OperationalNotificationCategory;
    label: string;
    unread: number;
    total: number;
  }>;
  items: NotificationInboxItemDto[];
}
