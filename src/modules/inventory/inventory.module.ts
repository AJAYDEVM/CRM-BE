import { Module } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, AuditService],
  exports: [InventoryService],
})
export class InventoryModule {}
