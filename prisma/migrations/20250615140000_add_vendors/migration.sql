-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactPerson" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT,
    "gstNumber" TEXT,
    "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "Vendor_companyName_idx" ON "Vendor"("companyName");
CREATE INDEX "Vendor_status_idx" ON "Vendor"("status");
CREATE INDEX "Vendor_email_idx" ON "Vendor"("email");
CREATE INDEX "InventoryItem_vendorId_idx" ON "InventoryItem"("vendorId");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
