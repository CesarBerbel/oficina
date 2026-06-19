import { Module } from '@nestjs/common';
import { FinancialController } from './financial.controller';
import { FinancialService } from './financial.service';
import { PostAccountingJournalUseCase } from './use-cases/post-accounting-journal.usecase';

@Module({
  controllers: [FinancialController],
  providers: [FinancialService, PostAccountingJournalUseCase],
  exports: [FinancialService],
})
export class FinancialModule {}
