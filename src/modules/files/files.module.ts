import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FileStorageService } from '../../common/services/file-storage.service';

@Module({
  controllers: [FilesController],
  providers: [FileStorageService],
})
export class FilesModule {}
