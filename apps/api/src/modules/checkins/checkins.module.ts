import { Module } from '@nestjs/common';
import { CheckinsService } from './checkins.service';
import { CheckinsController } from './checkins.controller';
import { PdfModule } from '../pdf/pdf.module';

@Module({
  imports: [PdfModule],
  controllers: [CheckinsController],
  providers: [CheckinsService],
  exports: [CheckinsService],
})
export class CheckinsModule {}
