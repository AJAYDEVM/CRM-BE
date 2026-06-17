import { Module } from '@nestjs/common';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [VendorsController],
  providers: [VendorsService, AuditService],
  exports: [VendorsService],
})
export class VendorsModule {}
