import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FileStorageService } from '../../common/services/file-storage.service';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [FilesController],
  providers: [FileStorageService, AuditService],
})
export class FilesModule {}
