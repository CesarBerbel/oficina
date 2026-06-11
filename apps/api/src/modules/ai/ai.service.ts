import { BadRequestException, Injectable } from '@nestjs/common';
import type {
  AiArticleInput,
  AiArticleResult,
  AiAssistInput,
  AiAssistResult,
  AiConfigDto,
  UpdateAiConfigInput,
} from '@oficina/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { CryptoService } from '../../infra/security/crypto.service';
import { AuditService } from '../audit/audit.service';
import { AiProviderService } from './ai-provider.service';
import type { AuthenticatedUser } from '../../common/types/authenticated-user';

@Injectable()
export class AiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly provider: AiProviderService,
  ) {}

  private async getOrCreate(tenantId: string) {
    const existing = await this.prisma.aiConfig.findUnique({ where: { tenantId } });
    if (existing) return existing;
    return this.prisma.aiConfig.create({ data: { tenantId } });
  }

  private toDto(c: {
    provider: AiConfigDto['provider'];
    apiKeyEnc: string | null;
    instructions: string | null;
    active: boolean;
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
      active: c.active,
    };
  }

  async get(tenantId: string): Promise<AiConfigDto> {
    return this.toDto(await this.getOrCreate(tenantId));
  }

  async update(
    actor: AuthenticatedUser,
    input: UpdateAiConfigInput,
  ): Promise<AiConfigDto> {
    await this.getOrCreate(actor.tenantId);
    const updated = await this.prisma.aiConfig.update({
      where: { tenantId: actor.tenantId },
      data: {
        ...(input.provider !== undefined ? { provider: input.provider } : {}),
        ...(input.instructions !== undefined
          ? { instructions: input.instructions ?? null }
          : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        ...(input.apiKey ? { apiKeyEnc: this.crypto.encrypt(input.apiKey) } : {}),
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
    };
  }

  /** Gera/melhora um trecho de texto (diagnóstico de OS, mensagem, etc.). */
  async assist(actor: AuthenticatedUser, input: AiAssistInput): Promise<AiAssistResult> {
    const client = await this.resolveClient(actor.tenantId);
    const system = [
      'Você é um assistente de uma oficina mecânica no Brasil.',
      'Escreva em português do Brasil, de forma clara, profissional e objetiva.',
      'Responda apenas com o texto solicitado, sem comentários extras.',
      client.instructions,
    ]
      .filter(Boolean)
      .join(' ');
    const user = input.content
      ? `${input.instruction}\n\nTexto base:\n${input.content}`
      : input.instruction;
    const text = await this.provider.chat(client.provider, client.apiKey, system, user);
    return { text };
  }

  /** Gera um artigo de blog completo a partir do assunto. */
  async article(actor: AuthenticatedUser, input: AiArticleInput): Promise<AiArticleResult> {
    const client = await this.resolveClient(actor.tenantId);
    const system = [
      'Você é um redator especialista em conteúdo para oficinas mecânicas no Brasil.',
      'Escreva em português do Brasil, tom acessível e confiável.',
      'Responda ESTRITAMENTE com um objeto JSON válido (sem markdown, sem cercas de código)',
      'no formato: {"title": string, "excerpt": string, "content": string, "seoTitle": string, "seoDescription": string}.',
      'O "content" deve ter vários parágrafos (use \\n\\n entre eles).',
      client.instructions,
    ]
      .filter(Boolean)
      .join(' ');
    const raw = await this.provider.chat(
      client.provider,
      client.apiKey,
      system,
      `Assunto do artigo: ${input.subject}`,
    );

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
