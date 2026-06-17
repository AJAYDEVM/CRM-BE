-- AlterTable Customer
ALTER TABLE "Customer" ADD COLUMN "gstNumber" TEXT;
ALTER TABLE "Customer" ADD COLUMN "shippingAddress" TEXT;

-- AlterTable Quotation
ALTER TABLE "Quotation" ADD COLUMN "reference" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "placeOfSupply" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "subject" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "customerGstin" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "billToAddress" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "shipToAddress" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "terms" TEXT;

-- AlterTable QuotationItem
ALTER TABLE "QuotationItem" ADD COLUMN "hsnCode" TEXT;

-- AlterTable Invoice
ALTER TABLE "Invoice" ADD COLUMN "placeOfSupply" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "subject" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "customerGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "billToAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "shipToAddress" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "paymentTerms" TEXT;

-- AlterTable InvoiceItem
ALTER TABLE "InvoiceItem" ADD COLUMN "hsnCode" TEXT;
ALTER TABLE "InvoiceItem" ADD COLUMN "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 18;

-- AlterTable CompanyProfile
ALTER TABLE "CompanyProfile" ADD COLUMN "cin" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "address" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "bankName" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "bankAccountNumber" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "bankBranch" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "bankIfsc" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "defaultQuotationTerms" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "defaultPaymentTerms" TEXT;
ALTER TABLE "CompanyProfile" ADD COLUMN "logoFileName" TEXT;
