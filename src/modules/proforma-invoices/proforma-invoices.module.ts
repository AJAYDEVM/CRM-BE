import { Module } from '@nestjs/common';
import { ProformaInvoicesService } from './proforma-invoices.service';
import { ProformaInvoicesController } from './proforma-invoices.controller';
import { ProformaInvoicePdfService } from './proforma-invoice-pdf.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [ProformaInvoicesController],
  providers: [ProformaInvoicesService, ProformaInvoicePdfService, AuditService],
  exports: [ProformaInvoicesService],
})
export class ProformaInvoicesModule {}
