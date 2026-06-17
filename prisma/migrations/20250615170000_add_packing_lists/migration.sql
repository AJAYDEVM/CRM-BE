-- CreateEnum
CREATE TYPE "PackingListStatus" AS ENUM ('DRAFT', 'SENT', 'PACKED');

-- CreateTable
CREATE TABLE "PackingList" (
    "id" TEXT NOT NULL,
    "packingListNumber" TEXT NOT NULL,
    "invoiceId" TEXT,
    "deliveryChallanId" TEXT,
    "customerId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "PackingListStatus" NOT NULL DEFAULT 'DRAFT',
    "packingDate" TIMESTAMP(3) NOT NULL,
    "totalPackages" INTEGER,
    "grossWeightKg" DECIMAL(10,2),
    "netWeightKg" DECIMAL(10,2),
    "notes" TEXT,
    "placeOfSupply" TEXT,
    "subject" TEXT,
    "customerGstin" TEXT,
    "billToAddress" TEXT,
    "shipToAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackingList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackingListItem" (
    "id" TEXT NOT NULL,
    "packingListId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "hsnCode" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Nos',
    "boxNo" TEXT,

    CONSTRAINT "PackingListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackingList_packingListNumber_key" ON "PackingList"("packingListNumber");
CREATE INDEX "PackingList_invoiceId_idx" ON "PackingList"("invoiceId");
CREATE INDEX "PackingList_deliveryChallanId_idx" ON "PackingList"("deliveryChallanId");
CREATE INDEX "PackingList_customerId_idx" ON "PackingList"("customerId");
CREATE INDEX "PackingList_projectId_idx" ON "PackingList"("projectId");
CREATE INDEX "PackingList_status_idx" ON "PackingList"("status");
CREATE INDEX "PackingList_packingDate_idx" ON "PackingList"("packingDate");
CREATE INDEX "PackingListItem_packingListId_idx" ON "PackingListItem"("packingListId");

-- AddForeignKey
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_deliveryChallanId_fkey" FOREIGN KEY ("deliveryChallanId") REFERENCES "DeliveryChallan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackingList" ADD CONSTRAINT "PackingList_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PackingListItem" ADD CONSTRAINT "PackingListItem_packingListId_fkey" FOREIGN KEY ("packingListId") REFERENCES "PackingList"("id") ON DELETE CASCADE ON UPDATE CASCADE;
