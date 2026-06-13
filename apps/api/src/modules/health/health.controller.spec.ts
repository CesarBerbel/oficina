import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;
  let prisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('retorna liveness sem consultar banco', () => {
    const result = controller.live();

    expect(result.status).toBe('ok');
    expect(result.dependencies.api).toBe('up');
    expect(result.dependencies.database).toBeUndefined();
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it('retorna ready ok quando o banco responde', async () => {
    const result = await controller.ready();

    expect(result.status).toBe('ok');
    expect(result.dependencies.database).toBe('up');
  });

  it('retorna 503 quando o banco nao responde', async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
