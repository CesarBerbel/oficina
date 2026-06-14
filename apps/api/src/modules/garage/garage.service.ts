import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  isTerminalStatus,
  type GarageDataDto,
  type GarageOrderDto,
  type GarageRequestCodeResult,
  type GarageSessionDto,
  type QuoteDecisionInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { PasswordService } from '../../infra/security/password.service';
import { MessagingService } from '../messaging/messaging.service';
import { SiteService, type PublicTenantLookup } from '../site/site.service';
import { QuotesService } from '../quotes/quotes.service';
import { quoteInclude, toQuoteDto } from '../quotes/quote.mapper';

const dec = (v: Prisma.Decimal | number | null | undefined): number =>
  v == null ? 0 : Number(v);

const CODE_TTL_MS = 5 * 60 * 60 * 1000; // 5 horas
const MAX_ATTEMPTS = 5;
const SESSION_TTL = '5h';
const GARAGE_SCOPE = 'garage';

interface GaragePayload {
  sub: string; // vehicleId
  tid: string; // tenantId
  cid: string; // customerId
  plate: string;
  scope: typeof GARAGE_SCOPE;
}

@Injectable()
export class GarageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly messaging: MessagingService,
    private readonly quotes: QuotesService,
    private readonly site: SiteService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private get secret(): string {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private vehicleLabel(v: {
    manufacturer: string;
    model: string;
    modelYear: number | null;
  }): string {
    return `${v.manufacturer} ${v.model}${v.modelYear ? ` ${v.modelYear}` : ''}`;
  }

  /** Tenant da oficina publicada (mesma regra do site/blog/leads públicos). */
  private publishedTenantId(lookup?: PublicTenantLookup): Promise<string | null> {
    return this.site.publishedTenantId(lookup);
  }

  /**
   * Gera e envia um código de 6 dígitos para o e-mail do dono da placa, se ela
   * existir na oficina publicada e o cliente tiver e-mail. A resposta é sempre
   * genérica para não revelar a existência da placa.
   */
  async requestCode(
    plate: string,
    lookup?: PublicTenantLookup,
  ): Promise<GarageRequestCodeResult> {
    const tenantId = await this.publishedTenantId(lookup);
    if (!tenantId) return { ok: true };

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { tenantId, plate },
      select: {
        id: true,
        plate: true,
        manufacturer: true,
        model: true,
        modelYear: true,
        customer: { select: { id: true, name: true, email: true } },
      },
    });

    const email = vehicle?.customer.email?.trim();
    if (!vehicle || !email) {
      // Não revela se a placa existe ou se há e-mail.
      return { ok: true };
    }

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = await this.passwords.hash(code);

    await this.prisma.$transaction(async (tx) => {
      // Invalida códigos anteriores ainda válidos para este veículo.
      await tx.garageAccessCode.updateMany({
        where: { vehicleId: vehicle.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      await tx.garageAccessCode.create({
        data: {
          tenantId,
          vehicleId: vehicle.id,
          customerId: vehicle.customer.id,
          codeHash,
          expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
    });

    await this.messaging.sendGarageAccessCode(tenantId, {
      to: email,
      code,
      customerName: vehicle.customer.name,
      plate: vehicle.plate,
      vehicleLabel: this.vehicleLabel(vehicle),
      customerId: vehicle.customer.id,
    });

    return { ok: true };
  }

  /**
   * Valida o código para a placa. Em caso de sucesso, emite um token de sessão
   * (JWT com escopo "garage") que dá acesso ao histórico do veículo.
   */
  async verifyCode(
    plate: string,
    code: string,
    lookup?: PublicTenantLookup,
  ): Promise<GarageSessionDto> {
    const invalid = new UnauthorizedException('Código inválido ou expirado.');

    const tenantId = await this.publishedTenantId(lookup);
    if (!tenantId) throw invalid;

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { tenantId, plate },
      select: {
        id: true,
        plate: true,
        manufacturer: true,
        model: true,
        modelYear: true,
        customer: { select: { id: true, name: true } },
        tenant: { select: { name: true } },
      },
    });
    if (!vehicle) throw invalid;

    const record = await this.prisma.garageAccessCode.findFirst({
      where: {
        vehicleId: vehicle.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!record) throw invalid;

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.prisma.garageAccessCode.update({
        where: { id: record.id },
        data: { consumedAt: new Date() },
      });
      throw invalid;
    }

    const ok = await this.passwords.verify(record.codeHash, code);
    if (!ok) {
      const attempts = record.attempts + 1;
      await this.prisma.garageAccessCode.update({
        where: { id: record.id },
        data: {
          attempts,
          // Esgotou as tentativas: invalida o código.
          ...(attempts >= MAX_ATTEMPTS ? { consumedAt: new Date() } : {}),
        },
      });
      throw invalid;
    }

    await this.prisma.garageAccessCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    const payload: GaragePayload = {
      sub: vehicle.id,
      tid: tenantId,
      cid: vehicle.customer.id,
      plate: vehicle.plate,
      scope: GARAGE_SCOPE,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.secret,
      expiresIn: SESSION_TTL,
    });

    return {
      token,
      expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
      shopName: vehicle.tenant.name,
      customerName: vehicle.customer.name,
      vehicle: { plate: vehicle.plate, label: this.vehicleLabel(vehicle) },
    };
  }

  /** Decodifica e valida o token de sessão da garagem a partir do header. */
  private async authenticate(authHeader: string | undefined): Promise<GaragePayload> {
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
    if (!token) throw new UnauthorizedException('Sessão inválida.');
    try {
      const payload = await this.jwt.verifyAsync<GaragePayload>(token, {
        secret: this.secret,
      });
      if (payload.scope !== GARAGE_SCOPE || !payload.sub || !payload.tid) {
        throw new UnauthorizedException('Sessão inválida.');
      }
      return payload;
    } catch {
      throw new UnauthorizedException('Sessão expirada. Consulte novamente.');
    }
  }

  /** Histórico do veículo: OS atual (em aberto) + anteriores, com serviços. */
  async getData(authHeader: string | undefined): Promise<GarageDataDto> {
    const session = await this.authenticate(authHeader);

    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: session.sub, tenantId: session.tid },
      select: {
        plate: true,
        manufacturer: true,
        model: true,
        modelYear: true,
        currentKm: true,
        tenant: { select: { name: true } },
        customer: { select: { name: true } },
        serviceOrders: {
          orderBy: { openedAt: 'desc' },
          include: {
            items: { orderBy: { createdAt: 'asc' } },
            history: { orderBy: { createdAt: 'asc' } },
            events: {
              where: { visibility: 'PUBLIC' },
              orderBy: { createdAt: 'asc' },
            },
            quote: { include: quoteInclude },
          },
        },
      },
    });
    if (!vehicle) throw new UnauthorizedException('Sessão inválida.');

    const orders: GarageOrderDto[] = vehicle.serviceOrders.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      openedAt: o.openedAt.toISOString(),
      closedAt: o.closedAt ? o.closedAt.toISOString() : null,
      reportedProblem: o.reportedProblem,
      diagnosis: o.diagnosis,
      total: dec(o.total),
      publicToken: o.publicToken,
      quote: o.quote ? toQuoteDto(o.quote, o.publicToken) : null,
      items: o.items.map((it) => ({
        kind: it.kind,
        description: it.description,
        quantity: dec(it.quantity),
        total: dec(it.total),
      })),
      timeline:
        o.events.length > 0
          ? o.events.map((event) => ({
              status: event.toStatus,
              title: event.title,
              note: event.description,
              photos: event.photos,
              createdAt: event.createdAt.toISOString(),
            }))
          : o.history.map((h) => ({
              status: h.status,
              title: h.status,
              note: h.note,
              photos: [],
              createdAt: h.createdAt.toISOString(),
            })),
    }));

    // OS atual = a mais recente que ainda não foi entregue/cancelada.
    const currentIndex = orders.findIndex((o) => !isTerminalStatus(o.status));
    const current = currentIndex >= 0 ? orders[currentIndex] : null;
    const past = orders.filter((_, i) => i !== currentIndex);

    return {
      shopName: vehicle.tenant.name,
      customerName: vehicle.customer.name,
      vehicle: {
        plate: vehicle.plate,
        label: this.vehicleLabel(vehicle),
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        modelYear: vehicle.modelYear,
        currentKm: vehicle.currentKm,
      },
      current,
      past,
    };
  }

  /**
   * Aplica uma decisão de orçamento a partir da sessão da garagem. Garante que
   * a OS pertence ao veículo autenticado antes de reutilizar a regra pública
   * existente de aprovação/recusa por token.
   */
  async decideQuote(
    authHeader: string | undefined,
    orderId: string,
    input: QuoteDecisionInput,
    meta: { ip?: string | null; userAgent?: string | string[] | null },
  ) {
    const session = await this.authenticate(authHeader);
    const order = await this.prisma.serviceOrder.findFirst({
      where: {
        id: orderId,
        tenantId: session.tid,
        vehicleId: session.sub,
        customerId: session.cid,
      },
      select: { publicToken: true },
    });
    if (!order) throw new NotFoundException('Orçamento não encontrado.');

    return this.quotes.applyDecisionByToken(order.publicToken, input, {
      ip: meta.ip ?? null,
      userAgent: Array.isArray(meta.userAgent)
        ? (meta.userAgent[0] ?? null)
        : (meta.userAgent ?? null),
    });
  }
}
