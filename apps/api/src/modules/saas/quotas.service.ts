import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PlanFeatureKey, Prisma } from '@prisma/client';
import {
  PLAN_FEATURE_LABELS,
  type AccountQuotaSummaryDto,
  type PlanFeatureKey as SharedFeature,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';

const BYTES_PER_MB = 1024 * 1024;

type QuotaClient = PrismaService | Prisma.TransactionClient;

const MONTHLY_FEATURES = new Set<PlanFeatureKey>([
  'SERVICE_ORDERS_MONTH',
  'UPLOADS_MONTH',
  'AI_MONTH',
  'MESSAGES_MONTH',
]);

@Injectable()
export class QuotasService {
  constructor(private readonly prisma: PrismaService) {}

  currentPeriod(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  async accountIdForTenant(tenantId: string): Promise<string> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { accountId: true },
    });
    return tenant.accountId;
  }

  private async featureLimit(
    accountId: string,
    feature: PlanFeatureKey,
    client: QuotaClient = this.prisma,
  ): Promise<{
    planId: string | null;
    enabled: boolean;
    limit: number | null;
  }> {
    const account = await client.account.findUnique({
      where: { id: accountId },
      select: {
        planId: true,
        planRef: { select: { id: true, active: true, limits: { where: { feature } } } },
        subscriptions: {
          where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { plan: { select: { id: true, active: true, limits: { where: { feature } } } } },
        },
      },
    });
    const plan = account?.subscriptions[0]?.plan ?? account?.planRef ?? null;
    if (!plan || !plan.active) return { planId: null, enabled: true, limit: null };
    const row = plan.limits[0];
    if (!row) return { planId: plan.id, enabled: true, limit: null };
    return { planId: plan.id, enabled: row.enabled, limit: row.limit };
  }

  private deny(feature: PlanFeatureKey, message: string): never {
    const label = PLAN_FEATURE_LABELS[feature as SharedFeature] ?? feature;
    throw new HttpException(`${label}: ${message}`, HttpStatus.PAYMENT_REQUIRED);
  }

  async assertAccountLimit(
    accountId: string,
    feature: PlanFeatureKey,
    currentUsage: number,
    increment = 1,
  ): Promise<void> {
    const rule = await this.featureLimit(accountId, feature);
    if (!rule.enabled) this.deny(feature, 'feature não disponível no plano atual.');
    if (rule.limit != null && currentUsage + increment > rule.limit) {
      this.deny(feature, `limite do plano atingido (${currentUsage}/${rule.limit}).`);
    }
  }

  async assertTenantLimit(
    tenantId: string,
    feature: PlanFeatureKey,
    currentUsage: number,
    increment = 1,
  ): Promise<void> {
    return this.assertAccountLimit(
      await this.accountIdForTenant(tenantId),
      feature,
      currentUsage,
      increment,
    );
  }

  async consume(
    accountId: string,
    feature: PlanFeatureKey,
    amount = 1,
    period = MONTHLY_FEATURES.has(feature) ? this.currentPeriod() : 'all',
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.consumeTx(tx, accountId, feature, amount, period);
    });
  }

  async consumeTx(
    tx: Prisma.TransactionClient,
    accountId: string,
    feature: PlanFeatureKey,
    amount = 1,
    period = MONTHLY_FEATURES.has(feature) ? this.currentPeriod() : 'all',
  ): Promise<void> {
    const rule = await this.featureLimit(accountId, feature, tx);
    if (!rule.enabled) this.deny(feature, 'feature não disponível no plano atual.');

    await tx.accountUsageCounter.upsert({
      where: { accountId_feature_period: { accountId, feature, period } },
      create: { accountId, feature, period, used: 0 },
      update: {},
    });
    const rows = await tx.$queryRaw<Array<{ id: string; used: number }>>`
      SELECT "id", "used"
      FROM "account_usage_counters"
      WHERE "accountId" = ${accountId} AND "feature" = ${feature}::"PlanFeatureKey" AND "period" = ${period}
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) {
      throw new Error('Falha ao bloquear contador de quota.');
    }
    const used = Number(row.used ?? 0);
    if (rule.limit != null && used + amount > rule.limit) {
      this.deny(feature, `limite do plano atingido (${used}/${rule.limit}).`);
    }
    await tx.accountUsageCounter.update({
      where: { id: row.id },
      data: { used: { increment: amount } },
    });
  }

  async consumeForTenant(tenantId: string, feature: PlanFeatureKey, amount = 1): Promise<void> {
    return this.consume(await this.accountIdForTenant(tenantId), feature, amount);
  }

  async consumeForTenantTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    feature: PlanFeatureKey,
    amount = 1,
  ): Promise<void> {
    const tenant = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { accountId: true },
    });
    return this.consumeTx(tx, tenant.accountId, feature, amount);
  }

  async assertStorageAvailableForTenant(tenantId: string, fileSizeBytes: number): Promise<void> {
    await this.assertStorageAvailableForTenantWithClient(this.prisma, tenantId, fileSizeBytes);
  }

  async assertStorageAvailableForTenantTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    fileSizeBytes: number,
  ): Promise<void> {
    await this.assertStorageAvailableForTenantWithClient(tx, tenantId, fileSizeBytes);
  }

  private async assertStorageAvailableForTenantWithClient(
    client: QuotaClient,
    tenantId: string,
    fileSizeBytes: number,
  ): Promise<void> {
    const tenant = await client.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { accountId: true },
    });
    const accountId = tenant.accountId;
    await client.$queryRaw`SELECT "id" FROM "accounts" WHERE "id" = ${accountId} FOR UPDATE`;
    const rule = await this.featureLimit(accountId, 'STORAGE_MB', client);
    if (!rule.enabled) this.deny('STORAGE_MB', 'feature não disponível no plano atual.');
    if (rule.limit == null) return;

    const currentBytes = await this.storageBytesForAccount(accountId, client);
    const usedMb = Math.ceil(currentBytes / BYTES_PER_MB);
    const nextMb = Math.ceil((currentBytes + Math.max(0, fileSizeBytes)) / BYTES_PER_MB);
    if (nextMb > rule.limit) {
      this.deny('STORAGE_MB', `limite do plano atingido (${usedMb}/${rule.limit}).`);
    }
  }

  private async storageBytesForAccount(
    accountId: string,
    client: QuotaClient = this.prisma,
  ): Promise<number> {
    const aggregate = await client.uploadAsset.aggregate({
      where: { tenant: { accountId } },
      _sum: { sizeBytes: true },
    });
    return Number(aggregate._sum.sizeBytes ?? 0);
  }

  async summaryForTenant(tenantId: string): Promise<AccountQuotaSummaryDto> {
    const tenant = await this.prisma.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { accountId: true },
    });
    return this.summaryForAccount(tenant.accountId);
  }

  async summaryForAccount(accountId: string): Promise<AccountQuotaSummaryDto> {
    const period = this.currentPeriod();
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        id: true,
        name: true,
        planRef: { select: { id: true, code: true, name: true, limits: true } },
        subscriptions: {
          where: { status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            accountId: true,
            planId: true,
            status: true,
            currentPeriodStart: true,
            currentPeriodEnd: true,
            trialEndsAt: true,
            createdAt: true,
            plan: { select: { id: true, code: true, name: true, limits: true } },
          },
        },
      },
    });

    const sub = account.subscriptions[0] ?? null;
    const plan = sub?.plan ?? account.planRef ?? null;
    const tenantIds = (
      await this.prisma.tenant.findMany({ where: { accountId }, select: { id: true } })
    ).map((t) => t.id);
    const monthStart = new Date(`${period}-01T00:00:00.000Z`);
    const nextMonth = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1),
    );
    const [users, branches, domains, orders, messages, counters, storageBytes] = await Promise.all([
      this.prisma.user.count({ where: { tenant: { accountId }, active: true } }),
      this.prisma.tenant.count({ where: { accountId } }),
      this.prisma.tenantDomain.count({ where: { tenant: { accountId } } }),
      this.prisma.serviceOrder.count({
        where: { tenantId: { in: tenantIds }, createdAt: { gte: monthStart, lt: nextMonth } },
      }),
      this.prisma.messageLog.count({
        where: { tenantId: { in: tenantIds }, createdAt: { gte: monthStart, lt: nextMonth } },
      }),
      this.prisma.accountUsageCounter.findMany({ where: { accountId, period } }),
      this.storageBytesForAccount(accountId),
    ]);
    const counter = new Map(counters.map((c) => [c.feature, c.used]));
    const usageByFeature: Record<PlanFeatureKey, number> = {
      USERS: users,
      BRANCHES: branches,
      CUSTOM_DOMAINS: domains,
      SERVICE_ORDERS_MONTH: orders,
      MESSAGES_MONTH: messages,
      AI_MONTH: counter.get('AI_MONTH') ?? 0,
      UPLOADS_MONTH: counter.get('UPLOADS_MONTH') ?? 0,
      STORAGE_MB: Math.ceil(storageBytes / BYTES_PER_MB),
    };
    const limitByFeature = new Map((plan?.limits ?? []).map((l) => [l.feature, l]));
    const features = Object.values(PlanFeatureKey);
    return {
      accountId: account.id,
      accountName: account.name,
      plan: plan
        ? { id: plan.id, code: plan.code, name: plan.name }
        : { id: null, code: null, name: null },
      subscription: sub
        ? {
            id: sub.id,
            accountId: sub.accountId,
            planId: sub.planId,
            planCode: sub.plan.code,
            planName: sub.plan.name,
            status: sub.status,
            currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
            createdAt: sub.createdAt.toISOString(),
          }
        : null,
      usage: features.map((feature) => {
        const row = limitByFeature.get(feature);
        const limit = row?.limit ?? null;
        const enabled = row?.enabled ?? true;
        const used = usageByFeature[feature] ?? 0;
        return {
          feature: feature as SharedFeature,
          label: PLAN_FEATURE_LABELS[feature as SharedFeature] ?? feature,
          enabled,
          limit,
          used,
          remaining: limit == null ? null : Math.max(0, limit - used),
          period: MONTHLY_FEATURES.has(feature) ? period : 'all',
          exceeded: !enabled || (limit != null && used > limit),
        };
      }),
    };
  }
}
