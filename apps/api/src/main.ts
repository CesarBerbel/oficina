import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { isAbsolute, join } from 'node:path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantDomainsService } from './modules/tenant-domains/tenant-domains.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);

  app.useLogger(app.get(Logger));
  const expressApp = app.getHttpAdapter().getInstance() as express.Express;
  expressApp.set('trust proxy', 1);
  // CORP cross-origin para o frontend (porta 3000) carregar imagens da API.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cookieParser());

  // Arquivos enviados (uploads locais) servidos em /uploads.
  const uploadsDir = config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads';
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

  const prefix = config.get<string>('API_GLOBAL_PREFIX') ?? 'api';
  app.setGlobalPrefix(prefix);

  const tenantDomains = app.get(TenantDomainsService);
  app.enableCors({
    origin: async (origin, callback) => {
      try {
        const allowed = await tenantDomains.isAllowedOrigin(origin);
        callback(allowed ? null : new Error('Origin not allowed by CORS'), allowed);
      } catch (err) {
        callback(err instanceof Error ? err : new Error('CORS origin validation failed'), false);
      }
    },
    credentials: true,
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get<number>('API_PORT') ?? 3333;
  await app.listen(port, '0.0.0.0');

  const logger = app.get(Logger);
  logger.log(`API rodando em http://localhost:${port}/${prefix}`);
}

void bootstrap();
