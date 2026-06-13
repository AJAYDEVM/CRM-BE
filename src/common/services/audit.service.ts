import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditAction, Prisma } from '@prisma/client';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    userId: string;
    changes?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    return this.prisma.auditLog.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        userId: params.userId,
        changes: params.changes as Prisma.InputJsonValue | undefined,
        metadata: params.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
