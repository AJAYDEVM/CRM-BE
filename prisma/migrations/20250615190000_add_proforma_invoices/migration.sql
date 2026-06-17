-- CreateEnum
CREATE TYPE "ProformaInvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'CONVERTED');

-- CreateTable
CREATE TABLE "ProformaInvoice" (
    "id" TEXT NOT NULL,
    "proformaNumber" TEXT NOT NULL,
    "quotationId" TEXT,
    "invoiceId" TEXT,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ProformaInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "proformaDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "tax" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(15,2) NOT NULL,
    "placeOfSupply" TEXT,
    "subject" TEXT,
    "customerGstin" TEXT,
    "billToAddress" TEXT,
    "shipToAddress" TEXT,
    "paymentTerms" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProformaInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProformaInvoiceItem" (
    "id" TEXT NOT NULL,
    "proformaInvoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitPrice" DECIMAL(15,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18,
    "amount" DECIMAL(15,2) NOT NULL,

    CONSTRAINT "ProformaInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProformaInvoice_proformaNumber_key" ON "ProformaInvoice"("proformaNumber");
CREATE UNIQUE INDEX "ProformaInvoice_invoiceId_key" ON "ProformaInvoice"("invoiceId");
CREATE INDEX "ProformaInvoice_quotationId_idx" ON "ProformaInvoice"("quotationId");
CREATE INDEX "ProformaInvoice_customerId_idx" ON "ProformaInvoice"("customerId");
CREATE INDEX "ProformaInvoice_projectId_idx" ON "ProformaInvoice"("projectId");
CREATE INDEX "ProformaInvoice_status_idx" ON "ProformaInvoice"("status");
CREATE INDEX "ProformaInvoice_proformaDate_idx" ON "ProformaInvoice"("proformaDate");
CREATE INDEX "ProformaInvoice_dueDate_idx" ON "ProformaInvoice"("dueDate");
CREATE INDEX "ProformaInvoiceItem_proformaInvoiceId_idx" ON "ProformaInvoiceItem"("proformaInvoiceId");

-- AddForeignKey
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoice" ADD CONSTRAINT "ProformaInvoice_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProformaInvoiceItem" ADD CONSTRAINT "ProformaInvoiceItem_proformaInvoiceId_fkey" FOREIGN KEY ("proformaInvoiceId") REFERENCES "ProformaInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
