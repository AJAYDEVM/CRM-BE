import { Module } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, AuditService],
  exports: [CustomersService],
})
export class CustomersModule {}
