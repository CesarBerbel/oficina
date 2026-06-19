import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  aiFieldDefault,
  type AiArticleInput,
  type AiArticleResult,
  type AiAssistInput,
  type AiAssistResult,
  type AiConfigDto,
  type AiUsageSummaryDto,
  type UpdateAiConfigInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../infra/security/crypto.service';
import { AuditService } from '../audit/audit.service';
import { AiProviderService } from './ai-provider.service';
import { QuotasService } from '../saas/quotas.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly provider: AiProviderService,
    private readonly quotas: QuotasService,
  ) {}

  private async getOrCreate(tenantId: string) {
    const existing = await this.prisma.aiConfig.findUnique({ where: { tenantId } });
    if (existing) return existing;
    return this.prisma.aiConfig.create({ data: { tenantId } });
  }

  /** Lê o mapa de instruções por campo (JSON) de forma segura. */
  private parseFieldInstructions(value: Prisma.JsonValue | null): Record<string, string> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === 'string' && v.trim()) out[k] = v;
    }
    return out;
  }

  private toDto(c: {
    provider: AiConfigDto['provider'];
    apiKeyEnc: string | null;
    instructions: string | null;
    fieldInstructions: Prisma.JsonValue | null;
    active: boolean;
    dailyLimit: number | null;
    monthlyLimit: number | null;
    perUserDailyLimit: number | null;
  }): AiConfigDto {
    let maskedKey: string | null = null;
    if (c.apiKeyEnc) {
      try {
        maskedKey = CryptoService.mask(this.crypto.decrypt(c.apiKeyEnc));
      } catch {
        maskedKey = '••••';
      }
    }
    return {
      provider: c.provider,
      hasKey: !!c.apiKeyEnc,
      maskedKey,
      instructions: c.instructions,
      fieldInstructions: this.parseFieldInstructions(c.fieldInstructions),
      active: c.active,
      dailyLimit: c.dailyLimit,
      monthlyLimit: c.monthlyLimit,
      perUserDailyLimit: c.perUserDailyLimit,
    };
  }

  /** null/0/undefined → null (ilimitado); senão o inteiro positivo. */
  private normLimit(v: number | null | undefined): number | null {
    return v && v > 0 ? Math.floor(v) : null;
  }

  async get(tenantId: string): Promise<AiConfigDto> {
    return this.toDto(await this.getOrCreate(tenantId));
  }

  async update(actor: AuthenticatedUser, input: UpdateAiConfigInput): Promise<AiConfigDto> {
    await this.getOrCreate(actor.tenantId);
    // Normaliza o mapa por campo: mantém só valores preenchidos.
    let fieldInstructions: Record<string, string> | undefined;
    if (input.fieldInstructions !== undefined) {
      fieldInstructions = {};
      for (const [k, v] of Object.entries(input.fieldInstructions)) {
        const t = (v ?? '').trim();
        if (t) fieldInstructions[k] = t;
      }
    }

    const updated = await this.prisma.aiConfig.update({
      where: { tenantId: actor.tenantId },
      data: {
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.instructions !== undefined ? { instructions: input.instructions ?? null } : {}),
        ...(fieldInstructions !== undefined
          ? { fieldInstructions: fieldInstructions as Prisma.InputJsonValue }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.apiKey ? { apiKeyEnc: this.crypto.encrypt(input.apiKey) } : {}),
        ...(input.dailyLimit !== undefined ? { dailyLimit: this.normLimit(input.dailyLimit) } : {}),
        ...(input.monthlyLimit !== undefined
          ? { monthlyLimit: this.normLimit(input.monthlyLimit) }
          : {}),
        ...(input.perUserDailyLimit !== undefined
          ? { perUserDailyLimit: this.normLimit(input.perUserDailyLimit) }
          : {}),
      },
    });
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'UPDATE',
      module: 'ai',
      entity: 'AiConfig',
      entityId: updated.id,
      after: { provider: updated.provider, active: updated.active, keyUpdated: !!input.apiKey },
    });
    return this.toDto(updated);
  }

  /** Resolve provedor + chave (decriptada) ou lança erro se não configurado. */
  private async resolveClient(tenantId: string) {
    const cfg = await this.prisma.aiConfig.findUnique({ where: { tenantId } });
    if (!cfg || !cfg.active || !cfg.apiKeyEnc) {
      throw new BadRequestException(
        'IA não configurada. Defina o provedor, a chave e ative em Configurações › IA.',
      );
    }
    return {
      provider: cfg.provider,
      apiKey: this.crypto.decrypt(cfg.apiKeyEnc),
      instructions: cfg.instructions ?? '',
      fieldInstructions: this.parseFieldInstructions(cfg.fieldInstructions),
      dailyLimit: cfg.dailyLimit,
      monthlyLimit: cfg.monthlyLimit,
      perUserDailyLimit: cfg.perUserDailyLimit,
    };
  }

  /** Aplica os limites de uso (tenant e por usuário) antes de chamar a IA. */
  private async assertWithinLimits(
    tenantId: string,
    userId: string,
    limits: {
      dailyLimit: number | null;
      monthlyLimit: number | null;
      perUserDailyLimit: number | null;
    },
  ): Promise<void> {
    const now = new Date();
    const startOfDay = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const deny = (msg: string): never => {
      throw new HttpException(msg, HttpStatus.TOO_MANY_REQUESTS);
    };

    if (limits.dailyLimit && limits.dailyLimit > 0) {
      const used = await this.prisma.aiUsageLog.count({
        where: { tenantId, createdAt: { gte: startOfDay } },
      });
      if (used >= limits.dailyLimit)
        deny(`Limite diário de uso de IA da oficina atingido (${limits.dailyLimit}).`);
    }
    if (limits.monthlyLimit && limits.monthlyLimit > 0) {
      const used = await this.prisma.aiUsageLog.count({
        where: { tenantId, createdAt: { gte: startOfMonth } },
      });
      if (used >= limits.monthlyLimit)
        deny(`Limite mensal de uso de IA da oficina atingido (${limits.monthlyLimit}).`);
    }
    if (limits.perUserDailyLimit && limits.perUserDailyLimit > 0) {
      const used = await this.prisma.aiUsageLog.count({
        where: { tenantId, userId, createdAt: { gte: startOfDay } },
      });
      if (used >= limits.perUserDailyLimit)
        deny(`Seu limite diário de uso de IA atingido (${limits.perUserDailyLimit}).`);
    }
  }

  /** Instrução específica do campo: override do tenant ou default do registro. */
  private fieldGuidance(
    fieldInstructions: Record<string, string>,
    field: string | undefined,
  ): string {
    if (!field) return '';
    return fieldInstructions[field]?.trim() || aiFieldDefault(field);
  }

  /** Gera/melhora um trecho de texto (diagnóstico de OS, mensagem, etc.). */
  async assist(actor: AuthenticatedUser, input: AiAssistInput): Promise<AiAssistResult> {
    const client = await this.resolveClient(actor.tenantId);
    await this.assertWithinLimits(actor.tenantId, actor.id, client);
    await this.quotas.consumeForTenant(actor.tenantId, 'AI_MONTH', 1);
    const system = [
      'Você é um assistente de uma oficina mecânica no Brasil.',
      'Escreva em português do Brasil, de forma clara, profissional e objetiva.',
      'Responda apenas com o texto solicitado, sem comentários extras.',
      client.instructions,
      this.fieldGuidance(client.fieldInstructions, input.field),
    ]
      .filter(Boolean)
      .join(' ');
    const user = input.content
      ? `${input.instruction}\n\nTexto base:\n${input.content}`
      : input.instruction;
    const inputChars = system.length + user.length;
    try {
      const res = await this.provider.chat(client.provider, client.apiKey, system, user);
      await this.logUsage({
        tenantId: actor.tenantId,
        userId: actor.id,
        kind: 'assist',
        field: input.field ?? null,
        provider: client.provider,
        success: true,
        inputChars,
        outputChars: res.text.length,
        totalTokens: res.totalTokens,
      });
      return { text: res.text };
    } catch (err) {
      await this.logUsage({
        tenantId: actor.tenantId,
        userId: actor.id,
        kind: 'assist',
        field: input.field ?? null,
        provider: client.provider,
        success: false,
        error: this.errMsg(err),
        inputChars,
        outputChars: 0,
        totalTokens: null,
      });
      throw err;
    }
  }

  /** Gera um artigo de blog completo a partir do assunto. */
  async article(actor: AuthenticatedUser, input: AiArticleInput): Promise<AiArticleResult> {
    const client = await this.resolveClient(actor.tenantId);
    await this.assertWithinLimits(actor.tenantId, actor.id, client);
    await this.quotas.consumeForTenant(actor.tenantId, 'AI_MONTH', 1);
    const system = [
      'Você é um redator especialista em conteúdo para oficinas mecânicas no Brasil.',
      'Escreva em português do Brasil, tom acessível e confiável.',
      'Responda ESTRITAMENTE com um objeto JSON válido (sem markdown, sem cercas de código)',
      'no formato: {"title": string, "excerpt": string, "content": string, "seoTitle": string, "seoDescription": string}.',
      'O "content" deve ter vários parágrafos (use \\n\\n entre eles).',
      client.instructions,
      this.fieldGuidance(client.fieldInstructions, 'blog_article'),
    ]
      .filter(Boolean)
      .join(' ');
    const userPrompt = `Assunto do artigo: ${input.subject}`;
    const inputChars = system.length + userPrompt.length;
    let raw: string;
    try {
      const res = await this.provider.chat(client.provider, client.apiKey, system, userPrompt);
      raw = res.text;
      await this.logUsage({
        tenantId: actor.tenantId,
        userId: actor.id,
        kind: 'article',
        field: 'blog_article',
        provider: client.provider,
        success: true,
        inputChars,
        outputChars: raw.length,
        totalTokens: res.totalTokens,
      });
    } catch (err) {
      await this.logUsage({
        tenantId: actor.tenantId,
        userId: actor.id,
        kind: 'article',
        field: 'blog_article',
        provider: client.provider,
        success: false,
        error: this.errMsg(err),
        inputChars,
        outputChars: 0,
        totalTokens: null,
      });
      throw err;
    }

    const parsed = this.tryParseArticle(raw);
    await this.audit.record({
      tenantId: actor.tenantId,
      userId: actor.id,
      action: 'AI_ARTICLE',
      module: 'ai',
      entity: 'BlogPost',
      after: { subject: input.subject, title: parsed.title },
    });
    return parsed;
  }

  /** Registra o uso da IA (best-effort: nunca quebra a resposta). */
  private async logUsage(data: {
    tenantId: string;
    userId: string | null;
    kind: 'assist' | 'article';
    field: string | null;
    provider: AiConfigDto['provider'];
    success: boolean;
    error?: string;
    inputChars: number;
    outputChars: number;
    totalTokens: number | null;
  }): Promise<void> {
    try {
      await this.prisma.aiUsageLog.create({
        data: {
          tenantId: data.tenantId,
          userId: data.userId,
          kind: data.kind,
          field: data.field,
          provider: data.provider,
          success: data.success,
          error: data.error ? data.error.slice(0, 500) : null,
          inputChars: data.inputChars,
          outputChars: data.outputChars,
          totalTokens: data.totalTokens,
        },
      });
    } catch {
      // logging não deve impactar a geração
    }
  }

  private errMsg(err: unknown): string {
    return err instanceof Error ? err.message : 'erro desconhecido';
  }

  /** Uso recente da IA (últimas chamadas) + totais dos últimos 30 dias. */
  async usage(tenantId: string): Promise<AiUsageSummaryDto> {
    const rows = await this.prisma.aiUsageLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 40,
    });
    const userIds = [...new Set(rows.map((r) => r.userId).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameById = new Map(users.map((u) => [u.id, u.name]));

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const agg = await this.prisma.aiUsageLog.aggregate({
      where: { tenantId, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { totalTokens: true },
    });

    return {
      logs: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        userName: r.userId ? (nameById.get(r.userId) ?? null) : null,
        kind: r.kind,
        field: r.field,
        provider: r.provider,
        success: r.success,
        totalTokens: r.totalTokens,
      })),
      totalCalls: agg._count._all,
      totalTokens: agg._sum.totalTokens ?? 0,
    };
  }

  private tryParseArticle(raw: string): AiArticleResult {
    const cleaned = raw
      .replace(/^```(?:json)?/i, '')
      .replace(/```$/i, '')
      .trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    try {
      const obj = JSON.parse(cleaned.slice(start, end + 1)) as Partial<AiArticleResult>;
      return {
        title: obj.title ?? 'Artigo',
        excerpt: obj.excerpt ?? '',
        content: obj.content ?? cleaned,
        seoTitle: obj.seoTitle ?? obj.title ?? 'Artigo',
        seoDescription: obj.seoDescription ?? obj.excerpt ?? '',
      };
    } catch {
      // Fallback: usa o texto bruto como conteúdo.
      return {
        title: 'Artigo gerado',
        excerpt: '',
        content: raw,
        seoTitle: 'Artigo gerado',
        seoDescription: '',
      };
    }
  }
}
