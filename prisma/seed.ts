import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding TMCI Operations Hub database...');

  const passwordHash = await bcrypt.hash('Admin@123', 12);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@tmci.com' },
    update: {},
    create: {
      email: 'admin@tmci.com',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: RoleName.ADMIN,
    },
  });

  const salesManager = await prisma.user.upsert({
    where: { email: 'sales@tmci.com' },
    update: {},
    create: {
      email: 'sales@tmci.com',
      passwordHash: await bcrypt.hash('Sales@123', 12),
      firstName: 'Arun',
      lastName: 'Mehta',
      role: RoleName.SALES,
    },
  });

  const pm = await prisma.user.upsert({
    where: { email: 'pm@tmci.com' },
    update: {},
    create: {
      email: 'pm@tmci.com',
      passwordHash: await bcrypt.hash('PM@123456', 12),
      firstName: 'Deepa',
      lastName: 'Nair',
      role: RoleName.PROJECT_MANAGER,
    },
  });

  await prisma.employee.upsert({
    where: { userId: admin.id },
    update: {},
    create: {
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      department: 'Administration',
      designation: 'System Administrator',
      userId: admin.id,
    },
  });

  const salesEmployee = await prisma.employee.upsert({
    where: { userId: salesManager.id },
    update: {},
    create: {
      firstName: salesManager.firstName,
      lastName: salesManager.lastName,
      email: salesManager.email,
      department: 'Sales',
      designation: 'Sales Manager',
      userId: salesManager.id,
    },
  });

  await prisma.employee.upsert({
    where: { userId: pm.id },
    update: {},
    create: {
      firstName: pm.firstName,
      lastName: pm.lastName,
      email: pm.email,
      department: 'Projects',
      designation: 'Project Manager',
      userId: pm.id,
    },
  });

  await prisma.employee.upsert({
    where: { id: 'seed-employee-ravi' },
    update: {},
    create: {
      id: 'seed-employee-ravi',
      firstName: 'Ravi',
      lastName: 'Sharma',
      email: 'ravi.sharma@tmci.com',
      phone: '+91 98765 11111',
      department: 'Field Operations',
      designation: 'Site Engineer',
    },
  });

  const permissions = [
    { name: 'customers:read', module: 'customers', description: 'View customers' },
    { name: 'customers:write', module: 'customers', description: 'Manage customers' },
    { name: 'projects:read', module: 'projects', description: 'View projects' },
    { name: 'projects:write', module: 'projects', description: 'Manage projects' },
    { name: 'expenses:approve', module: 'expenses', description: 'Approve expenses' },
    { name: 'invoices:write', module: 'invoices', description: 'Manage invoices' },
  ];

  for (const p of permissions) {
    await prisma.permission.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
  }

  const customer = await prisma.customer.upsert({
    where: { id: 'seed-customer-abc' },
    update: {},
    create: {
      id: 'seed-customer-abc',
      companyName: 'ABC Manufacturing Pvt Ltd',
      contactPerson: 'Rajesh Kumar',
      email: 'rajesh.kumar@abcmfg.com',
      phone: '+91 98765 43210',
      address: 'Plot 42, Industrial Area, Pune',
    },
  });

  await prisma.vendor.upsert({
    where: { id: 'seed-vendor-siemens' },
    update: {},
    create: {
      id: 'seed-vendor-siemens',
      companyName: 'Siemens India Pvt Ltd',
      contactPerson: 'Vikram Singh',
      email: 'vikram.singh@siemens.com',
      phone: '+91 80 2222 3333',
      address: 'Electronic City, Bengaluru',
    },
  });

  await prisma.vendor.upsert({
    where: { id: 'seed-vendor-abb' },
    update: {},
    create: {
      id: 'seed-vendor-abb',
      companyName: 'ABB India Ltd',
      contactPerson: 'Meera Iyer',
      email: 'meera.iyer@abb.com',
      phone: '+91 80 4444 5555',
      address: 'Whitefield, Bengaluru',
    },
  });

  const opportunity = await prisma.opportunity.upsert({
    where: { id: 'seed-opp-abc' },
    update: {},
    create: {
      id: 'seed-opp-abc',
      customerId: customer.id,
      name: 'ABC Factory Automation System',
      description: 'Complete factory automation with PLC and SCADA',
      estimatedAmount: 4500000,
      expectedCloseDate: new Date('2026-07-15'),
      status: 'NEGOTIATION',
    },
  });

  const preProject = await prisma.preProject.upsert({
    where: { id: 'seed-pp-abc' },
    update: {},
    create: {
      id: 'seed-pp-abc',
      opportunityId: opportunity.id,
      customerId: customer.id,
      name: 'ABC Factory Automation System',
      estimatedValue: 4500000,
      status: 'ACTIVE',
    },
  });

  await prisma.expense.createMany({
    data: [
      {
        category: 'TRAVEL',
        amount: 12000,
        date: new Date('2026-05-10'),
        employeeId: salesEmployee.id,
        referenceType: 'PRE_PROJECT',
        referenceId: preProject.id,
        preProjectId: preProject.id,
        description: 'Site visit travel',
        approvalStatus: 'APPROVED',
      },
      {
        category: 'HOTEL',
        amount: 5000,
        date: new Date('2026-05-10'),
        employeeId: salesEmployee.id,
        referenceType: 'PRE_PROJECT',
        referenceId: preProject.id,
        preProjectId: preProject.id,
        description: 'Hotel accommodation',
        approvalStatus: 'APPROVED',
      },
      {
        category: 'FOOD',
        amount: 2000,
        date: new Date('2026-05-11'),
        employeeId: salesEmployee.id,
        referenceType: 'PRE_PROJECT',
        referenceId: preProject.id,
        preProjectId: preProject.id,
        description: 'Client meeting meals',
        approvalStatus: 'APPROVED',
      },
    ],
    skipDuplicates: true,
  });

  const product = await prisma.product.upsert({
    where: { id: 'seed-product-osc' },
    update: {},
    create: {
      id: 'seed-product-osc',
      name: 'Oscilloscope',
      category: 'Test Equipment',
      description: 'Digital oscilloscope 200MHz',
    },
  });

  await prisma.inventoryItem.upsert({
    where: { serialNumber: 'OSC-12345' },
    update: {},
    create: {
      productId: product.id,
      serialNumber: 'OSC-12345',
      quantity: 1,
      location: 'Lab A - Shelf 3',
      status: 'AVAILABLE',
    },
  });

  await prisma.companyProfile.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      companyName: 'TMCI Engineering Pvt Ltd',
      gstNumber: '29AABCT1234A1Z5',
      email: 'info@tmci.com',
      phone: '+91 80 1234 5678',
    },
  });

  console.log('Seed complete.');
  console.log('Admin login: admin@tmci.com / Admin@123');
  console.log('Users created:', admin.email, salesManager.email, pm.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
