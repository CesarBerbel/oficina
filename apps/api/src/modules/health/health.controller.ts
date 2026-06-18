import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async dbUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  /** Compatibilidade: forma antiga (status/db/uptime). */
  @Public()
  @Get()
  async check(): Promise<{ status: string; db: string; uptime: number }> {
    const db = (await this.dbUp()) ? 'up' : 'down';
    return {
      status: db === 'up' ? 'ok' : 'degraded',
      db,
      uptime: Math.round(process.uptime()),
    };
  }

  /** Liveness: o processo está de pé (não toca no banco). */
  @Public()
  @Get('live')
  live(): { status: string; uptime: number } {
    return { status: 'ok', uptime: Math.round(process.uptime()) };
  }

  /** Readiness: pronto para receber tráfego (banco acessível). 503 se não. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: string; db: string }> {
    if (!(await this.dbUp())) {
      throw new ServiceUnavailableException({ status: 'unready', db: 'down' });
    }
    return { status: 'ready', db: 'up' };
  }

  /** Versão/identificação do serviço. */
  @Public()
  @Get('version')
  version(): { name: string; version: string; nodeEnv: string } {
    return {
      name: this.config.get<string>('APP_NAME') ?? 'Oficina',
      version: this.config.get<string>('APP_VERSION') ?? '0.0.0',
      nodeEnv: this.config.get<string>('NODE_ENV') ?? 'development',
    };
  }
}
