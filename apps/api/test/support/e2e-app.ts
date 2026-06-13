import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express from 'express';
import { isAbsolute, join } from 'node:path';
import { AppModule } from '../../src/app.module';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { ensureE2eEnv } from './e2e-env';

export async function createE2eApp(): Promise<INestApplication> {
  ensureE2eEnv();

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  const config = app.get(ConfigService);
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  const uploadsDir = config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads';

  app.use(cookieParser());
  app.use(
    '/uploads',
    express.static(isAbsolute(uploadsDir) ? uploadsDir : join(process.cwd(), uploadsDir), {
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'; sandbox",
        );
      },
    }),
  );
  expressApp.set('trust proxy', 1);
  app.setGlobalPrefix(process.env.API_GLOBAL_PREFIX ?? 'api');
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();
  return app;
}
