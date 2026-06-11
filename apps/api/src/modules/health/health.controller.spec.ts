import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from '../../infra/prisma/prisma.service';

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) },
        },
      ],
    }).compile();

    controller = moduleRef.get(HealthController);
  });

  it('retorna status ok quando o banco responde', async () => {
    const result = await controller.check();
    expect(result.status).toBe('ok');
    expect(result.db).toBe('up');
  });
});
