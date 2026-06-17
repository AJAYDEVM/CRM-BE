import { Module } from '@nestjs/common';
import { CreditNotesService } from './credit-notes.service';
import { CreditNotesController } from './credit-notes.controller';
import { CreditNotePdfService } from './credit-note-pdf.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [CreditNotesController],
  providers: [CreditNotesService, CreditNotePdfService, AuditService],
  exports: [CreditNotesService],
})
export class CreditNotesModule {}
