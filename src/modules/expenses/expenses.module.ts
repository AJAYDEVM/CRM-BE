import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [ExpensesController],
  providers: [ExpensesService, AuditService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
