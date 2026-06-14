import { Module } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { LeadsController } from './leads.controller';
import { ReceptionPushAlertsService } from './reception-push-alerts.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, ReceptionPushAlertsService],
  exports: [LeadsService, ReceptionPushAlertsService],
})
export class LeadsModule {}
