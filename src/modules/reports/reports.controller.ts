import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/database/prisma.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(private prisma: PrismaService) {}

  @Get('dashboard')
  async dashboard() {
    const [
      totalOpportunities,
      activeProjects,
      pendingQuotations,
      monthlyExpenses,
      inventoryItems,
      pendingInvoices,
    ] = await Promise.all([
      this.prisma.opportunity.count(),
      this.prisma.project.count({ where: { status: 'ACTIVE' } }),
      this.prisma.quotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
      this.prisma.expense.aggregate({
        where: {
          date: {
            gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
          },
        },
        _sum: { amount: true },
      }),
      this.prisma.inventoryItem.aggregate({ _sum: { quantity: true } }),
      this.prisma.invoice.count({ where: { status: { in: ['SENT', 'OVERDUE'] } } }),
    ]);

    const projects = await this.prisma.project.findMany({
      where: { status: 'ACTIVE' },
      select: { name: true, budget: true, spent: true },
    });

    return {
      stats: {
        totalOpportunities,
        activeProjects,
        pendingQuotations,
        monthlyExpenses: Number(monthlyExpenses._sum.amount ?? 0),
        inventoryItems: inventoryItems._sum.quantity ?? 0,
        pendingInvoices,
      },
      expenseVsBudget: projects.map((p) => ({
        project: p.name,
        budget: Number(p.budget),
        spent: Number(p.spent),
      })),
    };
  }

  @Get('revenue')
  async revenue() {
    const invoices = await this.prisma.invoice.findMany({
      where: { status: 'PAID' },
      select: { total: true, createdAt: true },
    });
    return invoices;
  }

  @Get('profitability')
  async profitability() {
    return this.prisma.project.findMany({
      select: { name: true, budget: true, spent: true, status: true },
    });
  }
}
