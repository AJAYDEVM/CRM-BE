import { Module } from '@nestjs/common';
import { PackingListsService } from './packing-lists.service';
import { PackingListsController } from './packing-lists.controller';
import { PackingListPdfService } from './packing-list-pdf.service';
import { AuditService } from '../../common/services/audit.service';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PackingListsController],
  providers: [PackingListsService, PackingListPdfService, AuditService],
  exports: [PackingListsService],
})
export class PackingListsModule {}
