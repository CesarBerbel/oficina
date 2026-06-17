import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { RequestContextMiddleware } from './common/middleware/request-context.middleware';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { validateEnv } from './infra/config/env';
import { PrismaModule } from './infra/prisma/prisma.module';
import { SecurityModule } from './infra/security/security.module';
import { MailModule } from './infra/mail/mail.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
import { CheckinsModule } from './modules/checkins/checkins.module';
import { ServiceOrdersModule } from './modules/service-orders/service-orders.module';
import { ServicesModule } from './modules/services/services.module';
import { CombosModule } from './modules/combos/combos.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { QuotesModule } from './modules/quotes/quotes.module';
import { PublicModule } from './modules/public/public.module';
import { GarageModule } from './modules/garage/garage.module';
import { PdfModule } from './modules/pdf/pdf.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { NfeImportModule } from './modules/nfe-import/nfe-import.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { SiteModule } from './modules/site/site.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { BlogModule } from './modules/blog/blog.module';
import { LeadsModule } from './modules/leads/leads.module';
import { AiModule } from './modules/ai/ai.module';
import { ReportsModule } from './modules/reports/reports.module';
import { CrmModule } from './modules/crm/crm.module';
import { GlobalSearchModule } from './modules/global-search/global-search.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { HealthModule } from './modules/health/health.module';
import { FinancialModule } from './modules/financial/financial.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // .env único na raiz do monorepo (também usado pelo docker-compose).
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        pinoHttp: {
          level: config.get('NODE_ENV') === 'production' ? 'info' : 'debug',
          transport:
            config.get('NODE_ENV') !== 'production'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          redact: ['req.headers.authorization', 'req.headers.cookie'],
          autoLogging: true,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: Number(config.get('RATE_LIMIT_TTL')) * 1000,
          limit: Number(config.get('RATE_LIMIT_MAX')),
        },
      ],
    }),
    PrismaModule,
    SecurityModule,
    MailModule,
    AuditModule,
    NotificationsModule,
    MessagingModule,
    OutboxModule,
    TenantsModule,
    DashboardModule,
    SiteModule,
    CategoriesModule,
    BlogModule,
    LeadsModule,
    AiModule,
    ReportsModule,
    CrmModule,
    GlobalSearchModule,
    UploadsModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    VehiclesModule,
    CheckinsModule,
    ServiceOrdersModule,
    ServicesModule,
    CombosModule,
    InventoryModule,
    QuotesModule,
    PublicModule,
    GarageModule,
    PdfModule,
    SuppliersModule,
    PurchasesModule,
    FinancialModule,
    NfeImportModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
