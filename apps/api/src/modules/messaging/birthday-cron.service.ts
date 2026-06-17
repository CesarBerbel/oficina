import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { MessagingService } from './messaging.service';

/**
 * Dispara as mensagens de aniversário dos clientes uma vez por dia.
 * Idempotente no dia (o `dispatchCustomerBirthday` evita reenvio).
 */
@Injectable()
export class BirthdayCronService {
  private readonly logger = new Logger(BirthdayCronService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly messaging: MessagingService,
  ) {}

  @Cron('0 8 * * *', {
    name: 'customer-birthday',
    timeZone: 'America/Sao_Paulo',
  })
  async run(): Promise<void> {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const rows = await this.prisma.$queryRaw<Array<{ id: string; tenantId: string }>>`
      SELECT "id", "tenantId" FROM "customers"
      WHERE "birthDate" IS NOT NULL
        AND EXTRACT(MONTH FROM "birthDate") = ${month}
        AND EXTRACT(DAY FROM "birthDate") = ${day}
    `;
    if (rows.length === 0) return;

    this.logger.log(`Aniversariantes de hoje: ${rows.length}`);
    for (const r of rows) {
      try {
        await this.messaging.dispatchCustomerBirthday(r.tenantId, r.id);
      } catch (err) {
        this.logger.warn(
          `Falha no aniversário do cliente ${r.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }
}
