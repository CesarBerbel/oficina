import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('HealthController', () => {
  async function build(queryImpl: () => Promise<unknown>) {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: PrismaService, useValue: { $queryRaw: jest.fn(queryImpl) } },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => ({ APP_NAME: 'Oficina', APP_VERSION: '1.2.3' })[k] },
        },
      ],
    }).compile();
    return moduleRef.get(HealthController);
  }

  it('check/ready retornam ok quando o banco responde', async () => {
    const controller = await build(async () => [{ '?column?': 1 }]);
    const check = await controller.check();
    expect(check).toMatchObject({ status: 'ok', db: 'up' });
    const ready = await controller.ready();
    expect(ready).toMatchObject({ status: 'ready', db: 'up' });
  });

  it('ready lança 503 quando o banco está fora', async () => {
    const controller = await build(async () => {
      throw new Error('db down');
    });
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('live não depende do banco', async () => {
    const controller = await build(async () => {
      throw new Error('db down');
    });
    expect(controller.live().status).toBe('ok');
  });

  it('version reflete APP_NAME/APP_VERSION', async () => {
    const controller = await build(async () => [{ '?column?': 1 }]);
    expect(controller.version()).toMatchObject({ name: 'Oficina', version: '1.2.3' });
  });
});
