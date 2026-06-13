import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Public } from '../../common/decorators/public.decorator';

type HealthStatus = 'ok' | 'degraded';
type DependencyStatus = 'up' | 'down';

interface HealthResponse {
  status: HealthStatus;
  uptime: number;
  timestamp: string;
  version: string;
  environment: string;
  dependencies: {
    api: DependencyStatus;
    database?: DependencyStatus;
  };
}

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    return this.ready();
  }

  @Public()
  @Get('live')
  @HttpCode(200)
  live(): HealthResponse {
    return this.buildResponse('ok', { api: 'up' });
  }

  @Public()
  @Get('ready')
  async ready(): Promise<HealthResponse> {
    const database = await this.databaseStatus();
    const status: HealthStatus = database === 'up' ? 'ok' : 'degraded';
    const response = this.buildResponse(status, { api: 'up', database });

    if (database === 'down') {
      throw new ServiceUnavailableException(response);
    }

    return response;
  }

  @Public()
  @Get('version')
  @HttpCode(200)
  version() {
    return {
      name: process.env.APP_NAME ?? 'Oficina',
      version: process.env.APP_VERSION ?? '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
      node: process.version,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  private async databaseStatus(): Promise<DependencyStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'up';
    } catch {
      return 'down';
    }
  }

  private buildResponse(
    status: HealthStatus,
    dependencies: HealthResponse['dependencies'],
  ): HealthResponse {
    return {
      status,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.1.0',
      environment: process.env.NODE_ENV ?? 'development',
      dependencies,
    };
  }
}
