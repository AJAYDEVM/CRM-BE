import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { paginatedResult, parsePagination } from '../../common/utils/pagination';
import { mapAuditLog } from '../../common/utils/audit-log.mapper';

@Injectable()
export class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  async findAll(options: { search?: string; page?: number; limit?: number }) {
    const where: Record<string, unknown> = {};

    if (options.search?.trim()) {
      const term = options.search.trim();
      where.OR = [
        { entityType: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const { page, limit, skip } = parsePagination(options.page, options.limit);

    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where: where as never }),
      this.prisma.auditLog.findMany({
        where: where as never,
        include: { user: { select: { email: true } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const data = rows.map(mapAuditLog);
    return paginatedResult(data, total, page, limit);
  }
}
