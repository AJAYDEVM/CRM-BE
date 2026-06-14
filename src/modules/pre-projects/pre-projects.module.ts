import { Module } from '@nestjs/common';
import { PreProjectsService } from './pre-projects.service';
import { PreProjectsController } from './pre-projects.controller';
import { AuditService } from '../../common/services/audit.service';
import { EmployeesModule } from '../employees/employees.module';

@Module({
  imports: [EmployeesModule],
  controllers: [PreProjectsController],
  providers: [PreProjectsService, AuditService],
  exports: [PreProjectsService],
})
export class PreProjectsModule {}
