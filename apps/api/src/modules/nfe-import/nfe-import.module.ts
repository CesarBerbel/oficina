import { Module } from '@nestjs/common';
import { NfeImportService } from './nfe-import.service';
import { NfeImportController } from './nfe-import.controller';

@Module({
  controllers: [NfeImportController],
  providers: [NfeImportService],
})
export class NfeImportModule {}
