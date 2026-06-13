import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { CustomersModule } from './modules/customers/customers.module';
import { OpportunitiesModule } from './modules/opportunities/opportunities.module';
import { QuotationsModule } from './modules/quotations/quotations.module';
import { PreProjectsModule } from './modules/pre-projects/pre-projects.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { InvoicesModule } from './modules/invoices/invoices.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FilesModule } from './modules/files/files.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    OpportunitiesModule,
    QuotationsModule,
    PreProjectsModule,
    ProjectsModule,
    ExpensesModule,
    InventoryModule,
    InvoicesModule,
    ReportsModule,
    FilesModule,
  ],
})
export class AppModule {}
