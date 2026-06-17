import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoicePdfService } from './invoice-pdf.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoicePdfService, AuditService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
