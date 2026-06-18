import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { SystemAlertsMonitorService } from './system-alerts-monitor.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, SystemAlertsMonitorService],
  exports: [MetricsService],
})
export class MetricsModule {}
