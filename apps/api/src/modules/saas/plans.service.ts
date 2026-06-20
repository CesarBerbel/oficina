import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  AccountQuotaSummaryDto,
  AccountSubscriptionDto,
  AssignAccountPlanInput,
  PlanDto,
  PlanUpgradeRequestDto,
  UpsertPlanInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { QuotasService } from './quotas.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly quotas: QuotasService,
  ) {}

  private toDto(p: {
    id: string;
    code: string;
    name: string;
    description: string | null;
    active: boolean;
    priceCents: number;
    currency: string;
    billingInterval: 'MONTHLY' | 'YEARLY';
    createdAt: Date;
    limits: Array<{
      feature: PlanDto['limits'][number]['feature'];
      enabled: boolean;
      limit: number | null;
    }>;
  }): PlanDto {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      description: p.description,
      active: p.active,
      priceCents: p.priceCents,
      currency: p.currency,
      billingInterval: p.billingInterval,
      limits: p.limits.map((l) => ({ feature: l.feature, enabled: l.enabled, limit: l.limit })),
      createdAt: p.createdAt.toISOString(),
    };
  }

  async list(): Promise<PlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      orderBy: { createdAt: 'asc' },
      include: { limits: true },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** Planos ATIVOS — visíveis ao cliente para escolher/solicitar upgrade. */
  async listActive(): Promise<PlanDto[]> {
    const rows = await this.prisma.plan.findMany({
      where: { active: true },
      orderBy: { priceCents: 'asc' },
      include: { limits: true },
    });
    return rows.map((r) => this.toDto(r));
  }

  /** A conta solicita upgrade para um plano (substitui pedido pendente anterior). */
  async requestUpgrade(accountId: string, planId: string): Promise<{ ok: true }> {
    const plan = await this.prisma.plan.findFirst({
      where: { id: planId, active: true },
      select: { id: true },
    });
    if (!plan) throw new NotFoundException('Plano não encontrado');
    await this.prisma.$transaction([
      this.prisma.planUpgradeRequest.updateMany({
        where: { accountId, status: 'PENDING' },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      }),
      this.prisma.planUpgradeRequest.create({ data: { accountId, planId } }),
    ]);
    return { ok: true };
  }

  /** Pedidos de upgrade pendentes (visão do super admin). */
  async listUpgradeRequests(): Promise<PlanUpgradeRequestDto[]> {
    const rows = await this.prisma.planUpgradeRequest.findMany({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      include: {
        account: { select: { name: true, slug: true } },
        plan: { select: { code: true, name: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      accountId: r.accountId,
      accountName: r.account.name,
      accountSlug: r.account.slug,
      planId: r.planId,
      planCode: r.plan.code,
      planName: r.plan.name,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  /** Aprova o pedido: atribui o plano à conta e marca como APPROVED. */
  async approveUpgrade(actor: AuthenticatedUser, id: string): Promise<AccountSubscriptionDto> {
    const req = await this.prisma.planUpgradeRequest.findUnique({ where: { id } });
    if (!req || req.status !== 'PENDING') {
      throw new NotFoundException('Pedido não encontrado ou já processado');
    }
    const sub = await this.assignToAccount(actor, req.accountId, {
      planId: req.planId,
      status: 'ACTIVE',
    });
    await this.prisma.planUpgradeRequest.update({
      where: { id },
      data: { status: 'APPROVED', resolvedAt: new Date() },
    });
    return sub;
  }

  /** Recusa o pedido de upgrade. */
  async rejectUpgrade(actor: AuthenticatedUser, id: string): Promise<{ ok: true }> {
    const res = await this.prisma.planUpgradeRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', resolvedAt: new Date() },
    });
    if (res.count === 0) throw new NotFoundException('Pedido não encontrado ou já processado');
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'plans',
      action: 'REJECT_PLAN_UPGRADE',
      entity: 'PlanUpgradeRequest',
      entityId: id,
    });
    return { ok: true };
  }

  async upsert(actor: AuthenticatedUser, input: UpsertPlanInput): Promise<PlanDto> {
    const code = input.code.trim().toLowerCase();
    const plan = await this.prisma.$transaction(async (tx) => {
      const p = await tx.plan.upsert({
        where: { code },
        create: {
          code,
          name: input.name,
          description: input.description ?? null,
          active: input.active ?? true,
          priceCents: input.priceCents ?? 0,
          currency: input.currency ?? 'BRL',
          billingInterval: input.billingInterval ?? 'MONTHLY',
        },
        update: {
          name: input.name,
          description: input.description ?? null,
          active: input.active ?? true,
          priceCents: input.priceCents ?? 0,
          currency: input.currency ?? 'BRL',
          billingInterval: input.billingInterval ?? 'MONTHLY',
        },
      });
      for (const limit of input.limits ?? []) {
        await tx.planFeatureLimit.upsert({
          where: { planId_feature: { planId: p.id, feature: limit.feature } },
          create: {
            planId: p.id,
            feature: limit.feature,
            enabled: limit.enabled ?? true,
            limit: limit.limit ?? null,
          },
          update: { enabled: limit.enabled ?? true, limit: limit.limit ?? null },
        });
      }
      return tx.plan.findUniqueOrThrow({ where: { id: p.id }, include: { limits: true } });
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'plans',
      action: 'UPSERT_PLAN',
      entity: 'Plan',
      entityId: plan.id,
      after: { code: plan.code },
    });
    return this.toDto(plan);
  }

  async assignToAccount(
    actor: AuthenticatedUser,
    accountId: string,
    input: AssignAccountPlanInput,
  ): Promise<AccountSubscriptionDto> {
    const [account, plan] = await Promise.all([
      this.prisma.account.findUnique({ where: { id: accountId }, select: { id: true } }),
      this.prisma.plan.findUnique({
        where: { id: input.planId },
        select: { id: true, code: true, name: true },
      }),
    ]);
    if (!account) throw new NotFoundException('Conta não encontrada');
    if (!plan) throw new NotFoundException('Plano não encontrado');
    const sub = await this.prisma.$transaction(async (tx) => {
      await tx.accountSubscription.updateMany({
        where: { accountId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE'] } },
        data: { status: 'CANCELED' },
      });
      await tx.account.update({
        where: { id: accountId },
        data: { planId: plan.id, plan: plan.code },
      });
      return tx.accountSubscription.create({
        data: {
          accountId,
          planId: plan.id,
          status: input.status ?? 'ACTIVE',
          currentPeriodStart: new Date(),
          currentPeriodEnd: input.currentPeriodEnd ? new Date(input.currentPeriodEnd) : null,
          trialEndsAt: input.trialEndsAt ? new Date(input.trialEndsAt) : null,
        },
        include: { plan: true },
      });
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      module: 'plans',
      action: 'ASSIGN_ACCOUNT_PLAN',
      entity: 'Account',
      entityId: accountId,
      after: { planId: plan.id, planCode: plan.code },
    });
    return {
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
    };
  }

  async accountUsage(accountId: string): Promise<AccountQuotaSummaryDto> {
    return this.quotas.summaryForAccount(accountId);
  }

  async tenantUsage(tenantId: string): Promise<AccountQuotaSummaryDto> {
    return this.quotas.summaryForTenant(tenantId);
  }
}
