import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service';
import { ExpenseCategory, InventoryItemStatus, InvoiceStatus, ProjectStatus } from '@prisma/client';

const PROJECT_STATUS_CHART: Record<
  ProjectStatus,
  { name: string; color: string }
> = {
  PLANNING: { name: 'Planning', color: '#64748b' },
  ACTIVE: { name: 'Active', color: '#2563eb' },
  COMPLETED: { name: 'Completed', color: '#16a34a' },
  CANCELLED: { name: 'Cancelled', color: '#dc2626' },
};

const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  TRAVEL: 'Travel',
  HOTEL: 'Hotel',
  FOOD: 'Food',
  TRANSPORT: 'Transport',
  MATERIAL: 'Material',
  SALARY: 'Salary',
  OTHER: 'Other',
};

const INVENTORY_STATUS_CHART: Record<
  InventoryItemStatus,
  { name: string; color: string }
> = {
  AVAILABLE: { name: 'Available', color: '#16a34a' },
  ASSIGNED: { name: 'Assigned', color: '#2563eb' },
  MAINTENANCE: { name: 'Maintenance', color: '#d97706' },
};

type Trend = { label: string; up: boolean } | null;

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  private getMonthWindows() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return { now, thisMonthStart, lastMonthStart, sixMonthsAgo };
  }

  private getLast6Months(now: Date) {
    return Array.from({ length: 6 }, (_, index) => {
      const offset = 5 - index;
      const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
      return {
        key: `${start.getFullYear()}-${start.getMonth()}`,
        label: start.toLocaleString('en-US', { month: 'short' }),
        start,
        end: end > now && offset === 0 ? now : end,
      };
    });
  }

  async getDashboard() {
    const { now, thisMonthStart, lastMonthStart, sixMonthsAgo } = this.getMonthWindows();
    const months = this.getLast6Months(now);

    const [
      totalOpportunities,
      activeProjects,
      pendingQuotations,
      monthlyExpenses,
      inventoryItems,
      pendingInvoices,
      oppsThisMonth,
      oppsLastMonth,
      completingSoon,
      lastMonthExpenses,
      overdueInvoices,
      activeProjectsList,
      payments,
      invoiced,
      projectStatusGroups,
    ] = await Promise.all([
      this.prisma.opportunity.count(),
      this.prisma.project.count({ where: { status: ProjectStatus.ACTIVE } }),
      this.prisma.quotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
      this.prisma.expense.aggregate({
        where: { date: { gte: thisMonthStart } },
        _sum: { amount: true },
      }),
      this.prisma.inventoryItem.aggregate({ _sum: { quantity: true } }),
      this.prisma.invoice.count({
        where: { status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } },
      }),
      this.prisma.opportunity.count({ where: { createdAt: { gte: thisMonthStart } } }),
      this.prisma.opportunity.count({
        where: { createdAt: { gte: lastMonthStart, lt: thisMonthStart } },
      }),
      this.prisma.project.count({
        where: {
          status: ProjectStatus.ACTIVE,
          endDate: {
            gte: now,
            lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.expense.aggregate({
        where: { date: { gte: lastMonthStart, lt: thisMonthStart } },
        _sum: { amount: true },
      }),
      this.prisma.invoice.count({
        where: {
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
          dueDate: { lt: now },
        },
      }),
      this.prisma.project.findMany({
        where: { status: ProjectStatus.ACTIVE },
        select: { name: true, budget: true, spent: true },
      }),
      this.prisma.payment.findMany({
        where: { paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          createdAt: { gte: sixMonthsAgo },
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PAID] },
        },
        select: { total: true, createdAt: true },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const thisMonthExpenseTotal = Number(monthlyExpenses._sum.amount ?? 0);
    const lastMonthExpenseTotal = Number(lastMonthExpenses._sum.amount ?? 0);

    const oppDelta = oppsThisMonth - oppsLastMonth;
    const expenseTrend = this.buildExpenseTrend(thisMonthExpenseTotal, lastMonthExpenseTotal);

    return {
      stats: {
        totalOpportunities,
        activeProjects,
        pendingQuotations,
        monthlyExpenses: thisMonthExpenseTotal,
        inventoryItems: inventoryItems._sum.quantity ?? 0,
        pendingInvoices,
        trends: {
          opportunities: this.buildDeltaTrend(oppDelta, 'this month'),
          activeProjects:
            completingSoon > 0
              ? { label: `${completingSoon} completing soon`, up: true }
              : null,
          monthlyExpenses: expenseTrend,
          pendingInvoices:
            overdueInvoices > 0
              ? { label: `${overdueInvoices} overdue`, up: false }
              : null,
        },
      },
      revenueOverview: this.buildRevenueOverview(months, payments, invoiced),
      projectStatus: Object.values(ProjectStatus).map((status) => {
        const group = projectStatusGroups.find((g) => g.status === status);
        const meta = PROJECT_STATUS_CHART[status];
        return {
          name: meta.name,
          value: group?._count._all ?? 0,
          color: meta.color,
        };
      }),
      expenseVsBudget: activeProjectsList.map((project) => ({
        project: project.name,
        budget: Number(project.budget),
        spent: Number(project.spent),
      })),
    };
  }

  async getAnalytics() {
    const { now, sixMonthsAgo } = this.getMonthWindows();
    const months = this.getLast6Months(now);

    const [payments, invoiced, projects, expenseGroups, inventoryGroups] = await Promise.all([
      this.prisma.payment.findMany({
        where: { paymentDate: { gte: sixMonthsAgo } },
        select: { amount: true, paymentDate: true },
      }),
      this.prisma.invoice.findMany({
        where: {
          createdAt: { gte: sixMonthsAgo },
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.PAID] },
        },
        select: { total: true, createdAt: true },
      }),
      this.prisma.project.findMany({
        select: { name: true, budget: true, spent: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.expense.groupBy({
        by: ['category'],
        _sum: { amount: true },
      }),
      this.prisma.inventoryItem.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    return {
      revenueOverview: this.buildRevenueOverview(months, payments, invoiced),
      profitability: projects.map((project) => {
        const budget = Number(project.budget);
        const spent = Number(project.spent);
        return {
          name: project.name.split(' ').slice(0, 2).join(' '),
          revenue: budget,
          cost: spent,
          profit: budget - spent,
        };
      }),
      expenseByCategory: expenseGroups
        .map((group) => ({
          category: EXPENSE_CATEGORY_LABELS[group.category],
          amount: Number(group._sum.amount ?? 0),
        }))
        .filter((row) => row.amount > 0)
        .sort((a, b) => b.amount - a.amount),
      inventoryUtilization: Object.values(InventoryItemStatus).map((status) => {
        const group = inventoryGroups.find((row) => row.status === status);
        const meta = INVENTORY_STATUS_CHART[status];
        return {
          name: meta.name,
          value: group?._count._all ?? 0,
          color: meta.color,
        };
      }),
    };
  }

  private addToMonthMap(map: Map<string, number>, date: Date, amount: number) {
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    if (map.has(key)) {
      map.set(key, (map.get(key) ?? 0) + amount);
    }
  }

  private buildRevenueOverview(
    months: ReturnType<ReportsService['getLast6Months']>,
    payments: Array<{ amount: unknown; paymentDate: Date }>,
    invoiced: Array<{ total: unknown; createdAt: Date }>,
  ) {
    const revenueByMonth = new Map<string, number>();
    const targetByMonth = new Map<string, number>();
    months.forEach((month) => {
      revenueByMonth.set(month.key, 0);
      targetByMonth.set(month.key, 0);
    });

    payments.forEach((payment) => {
      this.addToMonthMap(revenueByMonth, new Date(payment.paymentDate), Number(payment.amount));
    });

    invoiced.forEach((invoice) => {
      this.addToMonthMap(targetByMonth, new Date(invoice.createdAt), Number(invoice.total));
    });

    return months.map((month) => ({
      month: month.label,
      revenue: revenueByMonth.get(month.key) ?? 0,
      target: targetByMonth.get(month.key) ?? 0,
    }));
  }

  private buildDeltaTrend(delta: number, suffix: string): Trend {
    if (delta === 0) return null;
    return {
      label: `${delta > 0 ? '+' : ''}${delta} ${suffix}`,
      up: delta >= 0,
    };
  }

  private buildExpenseTrend(current: number, previous: number): Trend {
    if (previous === 0 && current === 0) return null;
    if (previous === 0) {
      return { label: 'New spend this month', up: false };
    }
    const pct = Math.round(((current - previous) / previous) * 100);
    if (pct === 0) return null;
    return {
      label: `${pct > 0 ? '+' : ''}${pct}% vs last month`,
      up: pct <= 0,
    };
  }

  async getRevenue() {
    return this.prisma.invoice.findMany({
      where: { status: InvoiceStatus.PAID },
      select: { total: true, createdAt: true },
    });
  }

  async getProfitability() {
    return this.prisma.project.findMany({
      select: { name: true, budget: true, spent: true, status: true },
    });
  }
}
