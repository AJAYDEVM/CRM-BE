-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "quotationId" TEXT;

-- CreateIndex
CREATE INDEX "Invoice_quotationId_idx" ON "Invoice"("quotationId");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
