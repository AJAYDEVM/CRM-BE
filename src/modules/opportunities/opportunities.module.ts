import { Module } from '@nestjs/common';
import { OpportunitiesService } from './opportunities.service';
import { OpportunitiesController } from './opportunities.controller';
import { AuditService } from '../../common/services/audit.service';

@Module({
  controllers: [OpportunitiesController],
  providers: [OpportunitiesService, AuditService],
  exports: [OpportunitiesService],
})
export class OpportunitiesModule {}
