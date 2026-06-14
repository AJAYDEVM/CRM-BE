import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { AuditService } from '../../common/services/audit.service';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [EmployeesModule],
  controllers: [ExpensesController],
  providers: [ExpensesService, AuditService],
  exports: [ExpensesService],
})
export class ExpensesModule {}
