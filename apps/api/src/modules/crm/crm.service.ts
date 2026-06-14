import { Injectable } from '@nestjs/common';
import { Prisma, type ServiceOrderStatus } from '@prisma/client';
import type {
  CrmSeasonalCampaignDto,
  CrmSettingsDto,
  PostSaleDto,
  PostSaleOpportunityDto,
  PostSaleOpportunityPriority,
  UpdateCrmSettingsInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const diffDays = (from: Date, to = new Date()): number =>
  Math.floor((to.getTime() - from.getTime()) / 86_400_000);

const deliveredStatuses: ServiceOrderStatus[] = ['ENTREGUE'];
const refusedStatuses: ServiceOrderStatus[] = ['ORCAMENTO_RECUSADO'];

const DEFAULT_CAMPAIGNS: CrmSeasonalCampaignDto[] = [
  {
    id: 'ferias-checkup',
    name: 'Férias e viagem',
    months: [6, 7, 12],
    title: 'Check-up para viagem',
    message: 'Olá, {cliente}. Antes da próxima viagem, podemos agendar um check-up preventivo do veículo {placa}?',
    vehicleAgeMinYears: null,
  },
  {
    id: 'inverno-bateria',
    name: 'Inverno / bateria',
    months: [5, 6, 7, 8],
    title: 'Revisão de bateria e arrefecimento',
    message: 'Olá, {cliente}. Nesta época é importante revisar bateria, arrefecimento e palhetas do veículo {placa}. Quer agendar?',
    vehicleAgeMinYears: 3,
  },
  {
    id: 'verao-ar',
    name: 'Verão / ar-condicionado',
    months: [10, 11, 12, 1, 2],
    title: 'Higienização e revisão do ar-condicionado',
    message: 'Olá, {cliente}. Podemos revisar e higienizar o ar-condicionado do veículo {placa} para o período de calor?',
    vehicleAgeMinYears: null,
  },
];

function vehicleLabel(vehicle?: {
  plate: string;
  manufacturer: string;
  model: string;
} | null): string | null {
  if (!vehicle) return null;
  return `${vehicle.plate} · ${vehicle.manufacturer} ${vehicle.model}`;
}

function normalizeCampaigns(value: unknown): CrmSeasonalCampaignDto[] {
  if (!Array.isArray(value)) return DEFAULT_CAMPAIGNS;
  return value
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    .map((item) => ({
      id: String(item.id ?? '').trim(),
      name: String(item.name ?? '').trim(),
      months: Array.isArray(item.months)
        ? item.months.map((m) => Number(m)).filter((m) => Number.isInteger(m) && m >= 1 && m <= 12)
        : [],
      title: String(item.title ?? '').trim(),
      message: String(item.message ?? '').trim(),
      vehicleAgeMinYears:
        item.vehicleAgeMinYears == null ? null : Number(item.vehicleAgeMinYears),
    }))
    .filter((item) => item.id && item.name && item.months.length > 0 && item.title && item.message);
}

function renderMessage(template: string, data: { cliente: string; placa?: string | null; veiculo?: string | null }): string {
  return template
    .replaceAll('{cliente}', data.cliente)
    .replaceAll('{placa}', data.placa ?? 'seu veículo')
    .replaceAll('{veiculo}', data.veiculo ?? data.placa ?? 'seu veículo');
}

function textHasKeyword(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toSettingsDto(settings: {
    enabled: boolean;
    reviewIntervalDays: number;
    reviewIntervalKm: number;
    reviewKmWarning: number;
    inactiveCustomerDays: number;
    postDeliveryStartDays: number;
    postDeliveryEndDays: number;
    refusedQuoteRecoveryDays: number;
    refusedQuoteMinimumAgeDays: number;
    highPriorityDays: number;
    mediumPriorityDays: number;
    enablePreventiveReview: boolean;
    enableKmReview: boolean;
    enableInactiveCustomers: boolean;
    enablePostDeliveryReturn: boolean;
    enableRefusedQuoteRecovery: boolean;
    enableRecommendedMaintenance: boolean;
    enableSeasonalCampaigns: boolean;
    recommendedMaintenanceKeywords: string[];
    seasonalCampaigns: Prisma.JsonValue | null;
  }): CrmSettingsDto {
    return {
      enabled: settings.enabled,
      reviewIntervalDays: settings.reviewIntervalDays,
      reviewIntervalKm: settings.reviewIntervalKm,
      reviewKmWarning: settings.reviewKmWarning,
      inactiveCustomerDays: settings.inactiveCustomerDays,
      postDeliveryStartDays: settings.postDeliveryStartDays,
      postDeliveryEndDays: settings.postDeliveryEndDays,
      refusedQuoteRecoveryDays: settings.refusedQuoteRecoveryDays,
      refusedQuoteMinimumAgeDays: settings.refusedQuoteMinimumAgeDays,
      highPriorityDays: settings.highPriorityDays,
      mediumPriorityDays: settings.mediumPriorityDays,
      enablePreventiveReview: settings.enablePreventiveReview,
      enableKmReview: settings.enableKmReview,
      enableInactiveCustomers: settings.enableInactiveCustomers,
      enablePostDeliveryReturn: settings.enablePostDeliveryReturn,
      enableRefusedQuoteRecovery: settings.enableRefusedQuoteRecovery,
      enableRecommendedMaintenance: settings.enableRecommendedMaintenance,
      enableSeasonalCampaigns: settings.enableSeasonalCampaigns,
      recommendedMaintenanceKeywords: settings.recommendedMaintenanceKeywords,
      seasonalCampaigns: normalizeCampaigns(settings.seasonalCampaigns),
    };
  }

  async getOrCreateSettings(tenantId: string) {
    const existing = await this.prisma.crmSettings.findUnique({ where: { tenantId } });
    if (existing) return existing;
    return this.prisma.crmSettings.create({
      data: { tenantId, seasonalCampaigns: DEFAULT_CAMPAIGNS as unknown as Prisma.InputJsonValue },
    });
  }

  async getSettings(tenantId: string): Promise<CrmSettingsDto> {
    return this.toSettingsDto(await this.getOrCreateSettings(tenantId));
  }

  async updateSettings(actor: AuthenticatedUser, input: UpdateCrmSettingsInput): Promise<CrmSettingsDto> {
    await this.getOrCreateSettings(actor.tenantId);
    const updated = await this.prisma.crmSettings.update({
      where: { tenantId: actor.tenantId },
      data: {
        ...input,
        ...(input.seasonalCampaigns !== undefined
          ? { seasonalCampaigns: input.seasonalCampaigns as unknown as Prisma.InputJsonValue }
          : {}),
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'crm',
      entity: 'CrmSettings',
      entityId: updated.id,
    });
    return this.toSettingsDto(updated);
  }

  private priorityByDays(days: number, settings: CrmSettingsDto): PostSaleOpportunityPriority {
    if (days >= settings.highPriorityDays) return 'alta';
    if (days >= settings.mediumPriorityDays) return 'media';
    return 'baixa';
  }

  async postSale(tenantId: string, limit = 80): Promise<PostSaleDto> {
    const now = new Date();
    const settings = await this.getSettings(tenantId);

    if (!settings.enabled) {
      return {
        generatedAt: now.toISOString(),
        settings,
        summary: {
          total: 0,
          highPriority: 0,
          preventiveReview: 0,
          kmReview: 0,
          inactiveCustomers: 0,
          postDeliveryReturn: 0,
          refusedQuotes: 0,
          recommendedMaintenance: 0,
          seasonalCampaigns: 0,
        },
        opportunities: [],
      };
    }

    const reviewCutoff = new Date(now);
    reviewCutoff.setDate(reviewCutoff.getDate() - settings.reviewIntervalDays);
    const inactiveCutoff = new Date(now);
    inactiveCutoff.setDate(inactiveCutoff.getDate() - settings.inactiveCustomerDays);
    const postDeliveryStart = new Date(now);
    postDeliveryStart.setDate(postDeliveryStart.getDate() - settings.postDeliveryEndDays);
    const postDeliveryEnd = new Date(now);
    postDeliveryEnd.setDate(postDeliveryEnd.getDate() - settings.postDeliveryStartDays);
    const refusedCutoff = new Date(now);
    refusedCutoff.setDate(refusedCutoff.getDate() - settings.refusedQuoteRecoveryDays);

    const [lastOrders, recentDelivered, refusedOrders] = await Promise.all([
      this.prisma.serviceOrder.findMany({
        where: { tenantId, status: { in: deliveredStatuses } },
        orderBy: { closedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          closedAt: true,
          openedAt: true,
          km: true,
          reportedProblem: true,
          diagnosis: true,
          notes: true,
          customer: { select: { id: true, name: true, phone: true, whatsapp: true, email: true } },
          vehicle: { select: { id: true, plate: true, manufacturer: true, model: true, modelYear: true, currentKm: true } },
        },
        take: 800,
      }),
      this.prisma.serviceOrder.findMany({
        where: {
          tenantId,
          status: 'ENTREGUE',
          closedAt: { gte: postDeliveryStart, lte: postDeliveryEnd },
        },
        orderBy: { closedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          closedAt: true,
          customer: { select: { id: true, name: true, phone: true, whatsapp: true, email: true } },
          vehicle: { select: { id: true, plate: true, manufacturer: true, model: true, modelYear: true, currentKm: true } },
        },
        take: 120,
      }),
      this.prisma.serviceOrder.findMany({
        where: { tenantId, status: { in: refusedStatuses }, updatedAt: { gte: refusedCutoff } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          number: true,
          total: true,
          updatedAt: true,
          customer: { select: { id: true, name: true, phone: true, whatsapp: true, email: true } },
          vehicle: { select: { id: true, plate: true, manufacturer: true, model: true, modelYear: true, currentKm: true } },
        },
        take: 120,
      }),
    ]);

    const lastByVehicle = new Map<string, (typeof lastOrders)[number]>();
    const lastByCustomer = new Map<string, (typeof lastOrders)[number]>();
    for (const order of lastOrders) {
      if (!lastByVehicle.has(order.vehicle.id)) lastByVehicle.set(order.vehicle.id, order);
      if (!lastByCustomer.has(order.customer.id)) lastByCustomer.set(order.customer.id, order);
    }

    const opportunities: PostSaleOpportunityDto[] = [];

    for (const order of lastByVehicle.values()) {
      const lastAt = order.closedAt ?? order.openedAt;
      const days = diffDays(lastAt, now);
      const label = vehicleLabel(order.vehicle);

      if (settings.enablePreventiveReview && lastAt <= reviewCutoff) {
        opportunities.push({
          key: `review-${order.vehicle.id}`,
          kind: 'REVISAO_PREVENTIVA',
          priority: this.priorityByDays(days, settings),
          title: 'Revisão preventiva por tempo',
          reason: `Veículo sem OS entregue há ${days} dias. Regra atual: ${settings.reviewIntervalDays} dias.`,
          suggestedMessage: `Olá, ${order.customer.name}. Tudo bem? O veículo ${order.vehicle.plate} já passou do período recomendado para revisão preventiva. Podemos agendar?`,
          customerId: order.customer.id,
          customerName: order.customer.name,
          phone: order.customer.phone,
          whatsapp: order.customer.whatsapp,
          email: order.customer.email,
          vehicleId: order.vehicle.id,
          vehicleLabel: label,
          serviceOrderId: order.id,
          serviceOrderNumber: order.number,
          lastServiceAt: lastAt.toISOString(),
          daysSinceLastService: days,
          currentKm: order.vehicle.currentKm,
          estimatedValue: dec(order.total),
        });
      }

      if (settings.enableKmReview) {
        const baseKm = order.km ?? order.vehicle.currentKm;
        const currentKm = order.vehicle.currentKm;
        if (baseKm != null && currentKm != null) {
          const nextReviewKm = baseKm + settings.reviewIntervalKm;
          const kmUntilReview = nextReviewKm - currentKm;
          if (kmUntilReview <= settings.reviewKmWarning) {
            opportunities.push({
              key: `km-review-${order.vehicle.id}`,
              kind: 'REVISAO_KM',
              priority: kmUntilReview <= 0 ? 'alta' : 'media',
              title: 'Revisão preventiva por quilometragem',
              reason: kmUntilReview <= 0
                ? `Revisão por KM vencida em ${Math.abs(kmUntilReview)} km.`
                : `Faltam ${kmUntilReview} km para a próxima revisão configurada.`,
              suggestedMessage: `Olá, ${order.customer.name}. O veículo ${order.vehicle.plate} está próximo da revisão por quilometragem. Podemos agendar uma revisão preventiva?`,
              customerId: order.customer.id,
              customerName: order.customer.name,
              phone: order.customer.phone,
              whatsapp: order.customer.whatsapp,
              email: order.customer.email,
              vehicleId: order.vehicle.id,
              vehicleLabel: label,
              serviceOrderId: order.id,
              serviceOrderNumber: order.number,
              lastServiceAt: lastAt.toISOString(),
              daysSinceLastService: days,
              currentKm,
              nextReviewKm,
              kmUntilReview,
              estimatedValue: dec(order.total),
            });
          }
        }
      }

      if (settings.enableRecommendedMaintenance) {
        const sourceText = [order.reportedProblem, order.diagnosis, order.notes].filter(Boolean).join(' ');
        if (sourceText && textHasKeyword(sourceText, settings.recommendedMaintenanceKeywords)) {
          opportunities.push({
            key: `recommended-${order.id}`,
            kind: 'MANUTENCAO_RECOMENDADA',
            priority: 'media',
            title: 'Manutenção recomendada para acompanhar',
            reason: 'A última OS possui observação/diagnóstico com palavra-chave de acompanhamento.',
            suggestedMessage: `Olá, ${order.customer.name}. Na última passagem do veículo ${order.vehicle.plate}, deixamos uma recomendação preventiva registrada. Podemos agendar uma avaliação?`,
            customerId: order.customer.id,
            customerName: order.customer.name,
            phone: order.customer.phone,
            whatsapp: order.customer.whatsapp,
            email: order.customer.email,
            vehicleId: order.vehicle.id,
            vehicleLabel: label,
            serviceOrderId: order.id,
            serviceOrderNumber: order.number,
            lastServiceAt: lastAt.toISOString(),
            daysSinceLastService: days,
            currentKm: order.vehicle.currentKm,
            estimatedValue: dec(order.total),
          });
        }
      }
    }

    if (settings.enableInactiveCustomers) {
      for (const order of lastByCustomer.values()) {
        const lastAt = order.closedAt ?? order.openedAt;
        if (lastAt > inactiveCutoff) continue;
        const days = diffDays(lastAt, now);
        opportunities.push({
          key: `inactive-${order.customer.id}`,
          kind: 'CLIENTE_INATIVO',
          priority: 'alta',
          title: 'Cliente inativo',
          reason: `Cliente sem retorno há ${days} dias. Regra atual: ${settings.inactiveCustomerDays} dias.`,
          suggestedMessage: `Olá, ${order.customer.name}. Sentimos sua falta na Auto Mecânica Bandeirantes. Quer agendar uma avaliação preventiva do veículo?`,
          customerId: order.customer.id,
          customerName: order.customer.name,
          phone: order.customer.phone,
          whatsapp: order.customer.whatsapp,
          email: order.customer.email,
          vehicleId: order.vehicle.id,
          vehicleLabel: vehicleLabel(order.vehicle),
          serviceOrderId: order.id,
          serviceOrderNumber: order.number,
          lastServiceAt: lastAt.toISOString(),
          daysSinceLastService: days,
          currentKm: order.vehicle.currentKm,
          estimatedValue: dec(order.total),
        });
      }
    }

    if (settings.enablePostDeliveryReturn) {
      for (const order of recentDelivered) {
        const closedAt = order.closedAt ?? now;
        const days = diffDays(closedAt, now);
        opportunities.push({
          key: `post-delivery-${order.id}`,
          kind: 'RETORNO_POS_ENTREGA',
          priority: 'media',
          title: 'Retorno pós-entrega',
          reason: `OS entregue há ${days} dias. Janela configurada: ${settings.postDeliveryStartDays} a ${settings.postDeliveryEndDays} dias.`,
          suggestedMessage: `Olá, ${order.customer.name}. Passando para saber se ficou tudo certo com o serviço no veículo ${order.vehicle.plate}. Conte com a Auto Mecânica Bandeirantes.`,
          customerId: order.customer.id,
          customerName: order.customer.name,
          phone: order.customer.phone,
          whatsapp: order.customer.whatsapp,
          email: order.customer.email,
          vehicleId: order.vehicle.id,
          vehicleLabel: vehicleLabel(order.vehicle),
          serviceOrderId: order.id,
          serviceOrderNumber: order.number,
          lastServiceAt: closedAt.toISOString(),
          daysSinceLastService: days,
          currentKm: order.vehicle.currentKm,
          estimatedValue: dec(order.total),
        });
      }
    }

    if (settings.enableRefusedQuoteRecovery) {
      for (const order of refusedOrders) {
        const days = diffDays(order.updatedAt, now);
        if (days < settings.refusedQuoteMinimumAgeDays) continue;
        opportunities.push({
          key: `refused-${order.id}`,
          kind: 'ORCAMENTO_RECUSADO',
          priority: days >= settings.refusedQuoteMinimumAgeDays ? 'media' : 'baixa',
          title: 'Orçamento recusado para recuperar',
          reason: `Orçamento recusado há ${days} dias.`,
          suggestedMessage: `Olá, ${order.customer.name}. Podemos rever o orçamento da OS ${order.number} e buscar a melhor alternativa para o veículo ${order.vehicle.plate}?`,
          customerId: order.customer.id,
          customerName: order.customer.name,
          phone: order.customer.phone,
          whatsapp: order.customer.whatsapp,
          email: order.customer.email,
          vehicleId: order.vehicle.id,
          vehicleLabel: vehicleLabel(order.vehicle),
          serviceOrderId: order.id,
          serviceOrderNumber: order.number,
          lastServiceAt: order.updatedAt.toISOString(),
          daysSinceLastService: days,
          currentKm: order.vehicle.currentKm,
          estimatedValue: dec(order.total),
        });
      }
    }

    if (settings.enableSeasonalCampaigns) {
      const month = now.getMonth() + 1;
      const campaigns = settings.seasonalCampaigns.filter((campaign) => campaign.months.includes(month));
      for (const campaign of campaigns) {
        for (const order of lastByVehicle.values()) {
          const age = order.vehicle.modelYear ? now.getFullYear() - order.vehicle.modelYear : null;
          if (campaign.vehicleAgeMinYears != null && (age == null || age < campaign.vehicleAgeMinYears)) continue;
          opportunities.push({
            key: `seasonal-${campaign.id}-${order.vehicle.id}`,
            kind: 'CAMPANHA_SAZONAL',
            priority: 'baixa',
            title: campaign.title,
            reason: `Campanha automática ativa em ${month.toString().padStart(2, '0')}/${now.getFullYear()}: ${campaign.name}.`,
            suggestedMessage: renderMessage(campaign.message, {
              cliente: order.customer.name,
              placa: order.vehicle.plate,
              veiculo: vehicleLabel(order.vehicle),
            }),
            customerId: order.customer.id,
            customerName: order.customer.name,
            phone: order.customer.phone,
            whatsapp: order.customer.whatsapp,
            email: order.customer.email,
            vehicleId: order.vehicle.id,
            vehicleLabel: vehicleLabel(order.vehicle),
            serviceOrderId: order.id,
            serviceOrderNumber: order.number,
            lastServiceAt: (order.closedAt ?? order.openedAt).toISOString(),
            daysSinceLastService: diffDays(order.closedAt ?? order.openedAt, now),
            currentKm: order.vehicle.currentKm,
            campaignName: campaign.name,
            estimatedValue: dec(order.total),
          });
        }
      }
    }

    const rank: Record<PostSaleOpportunityPriority, number> = { alta: 0, media: 1, baixa: 2 };
    const unique = new Map<string, PostSaleOpportunityDto>();
    for (const item of opportunities) {
      if (!unique.has(item.key)) unique.set(item.key, item);
    }

    const sorted = [...unique.values()]
      .sort((a, b) => rank[a.priority] - rank[b.priority] || (b.daysSinceLastService ?? 0) - (a.daysSinceLastService ?? 0))
      .slice(0, Math.max(1, Math.min(limit, 300)));

    return {
      generatedAt: now.toISOString(),
      settings,
      summary: {
        total: sorted.length,
        highPriority: sorted.filter((o) => o.priority === 'alta').length,
        preventiveReview: sorted.filter((o) => o.kind === 'REVISAO_PREVENTIVA').length,
        kmReview: sorted.filter((o) => o.kind === 'REVISAO_KM').length,
        inactiveCustomers: sorted.filter((o) => o.kind === 'CLIENTE_INATIVO').length,
        postDeliveryReturn: sorted.filter((o) => o.kind === 'RETORNO_POS_ENTREGA').length,
        refusedQuotes: sorted.filter((o) => o.kind === 'ORCAMENTO_RECUSADO').length,
        recommendedMaintenance: sorted.filter((o) => o.kind === 'MANUTENCAO_RECOMENDADA').length,
        seasonalCampaigns: sorted.filter((o) => o.kind === 'CAMPANHA_SAZONAL').length,
      },
      opportunities: sorted,
    };
  }
}
