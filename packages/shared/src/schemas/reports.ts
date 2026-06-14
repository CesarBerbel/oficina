export interface RevenuePoint {
  month: string; // YYYY-MM
  total: number;
}

export interface StatusCount {
  status: string;
  label: string;
  count: number;
}

export interface NamedTotal {
  name: string;
  value: number;
}

export interface ReportsSummary {
  /** Faturamento aprovado (OS aprovadas/entregues) no período. */
  revenueTotal: number;
  revenueByMonth: RevenuePoint[];
  osByStatus: StatusCount[];
  topServices: NamedTotal[]; // por valor
  topParts: NamedTotal[]; // por quantidade consumida
  deliveredCount: number;
  averageTicket: number;
  periodDays: number;
  openedOrders: number;
  approvalRate: number;
  conversionRate: number;
  grossProfit: number;
  grossMargin: number;
  partsCost: number;
  servicesCost: number;
  revenueByTechnician: NamedTotal[];
  revenueByCustomer: NamedTotal[];
  leadFunnel: StatusCount[];
  dailyRevenue: RevenuePoint[];
}
