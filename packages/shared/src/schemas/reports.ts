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
}
