import { Module } from '@nestjs/common';
import { DeliveryChallansService } from './delivery-challans.service';
import { DeliveryChallansController } from './delivery-challans.controller';
import { DeliveryChallanPdfService } from './delivery-challan-pdf.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [DeliveryChallansController],
  providers: [DeliveryChallansService, DeliveryChallanPdfService, AuditService],
  exports: [DeliveryChallansService],
})
export class DeliveryChallansModule {}
