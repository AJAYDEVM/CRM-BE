import { Module } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { QuotationPdfService } from './quotation-pdf.service';
import { QuotationsController } from './quotations.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [QuotationsController],
  providers: [QuotationsService, QuotationPdfService, AuditService],
  exports: [QuotationsService],
})
export class QuotationsModule {}
