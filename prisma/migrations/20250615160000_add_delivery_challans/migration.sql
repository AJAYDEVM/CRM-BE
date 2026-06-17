-- CreateEnum
CREATE TYPE "DeliveryChallanStatus" AS ENUM ('DRAFT', 'SENT', 'DISPATCHED');

-- CreateTable
CREATE TABLE "DeliveryChallan" (
    "id" TEXT NOT NULL,
    "challanNumber" TEXT NOT NULL,
    "invoiceId" TEXT,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "DeliveryChallanStatus" NOT NULL DEFAULT 'DRAFT',
    "challanDate" TIMESTAMP(3) NOT NULL,
    "vehicleNumber" TEXT,
    "driverName" TEXT,
    "transportMode" TEXT,
    "notes" TEXT,
    "placeOfSupply" TEXT,
    "subject" TEXT,
    "customerGstin" TEXT,
    "billToAddress" TEXT,
    "shipToAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryChallan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryChallanItem" (
    "id" TEXT NOT NULL,
    "deliveryChallanId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',

    CONSTRAINT "DeliveryChallanItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryChallan_challanNumber_key" ON "DeliveryChallan"("challanNumber");
CREATE INDEX "DeliveryChallan_invoiceId_idx" ON "DeliveryChallan"("invoiceId");
CREATE INDEX "DeliveryChallan_customerId_idx" ON "DeliveryChallan"("customerId");
CREATE INDEX "DeliveryChallan_projectId_idx" ON "DeliveryChallan"("projectId");
CREATE INDEX "DeliveryChallan_status_idx" ON "DeliveryChallan"("status");
CREATE INDEX "DeliveryChallan_challanDate_idx" ON "DeliveryChallan"("challanDate");
CREATE INDEX "DeliveryChallanItem_deliveryChallanId_idx" ON "DeliveryChallanItem"("deliveryChallanId");

-- AddForeignKey
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryChallan" ADD CONSTRAINT "DeliveryChallan_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "DeliveryChallanItem" ADD CONSTRAINT "DeliveryChallanItem_deliveryChallanId_fkey" FOREIGN KEY ("deliveryChallanId") REFERENCES "DeliveryChallan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
