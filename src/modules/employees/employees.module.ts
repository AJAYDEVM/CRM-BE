import { Module } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [EmployeesController],
  providers: [EmployeesService, AuditService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
