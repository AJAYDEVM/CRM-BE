-- Create Employee table
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "designation" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Employee_userId_key" ON "Employee"("userId");
CREATE INDEX "Employee_isActive_idx" ON "Employee"("isActive");
CREATE INDEX "Employee_lastName_firstName_idx" ON "Employee"("lastName", "firstName");

ALTER TABLE "Employee" ADD CONSTRAINT "Employee_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Migrate existing expense employee references (User -> Employee)
INSERT INTO "Employee" ("id", "firstName", "lastName", "email", "userId", "updatedAt")
SELECT
    'emp-' || u."id",
    u."firstName",
    u."lastName",
    u."email",
    u."id",
    CURRENT_TIMESTAMP
FROM "User" u
WHERE u."id" IN (SELECT DISTINCT "employeeId" FROM "Expense");

ALTER TABLE "Expense" ADD COLUMN "newEmployeeId" TEXT;

UPDATE "Expense" e
SET "newEmployeeId" = 'emp-' || e."employeeId";

ALTER TABLE "Expense" DROP CONSTRAINT "Expense_employeeId_fkey";
ALTER TABLE "Expense" DROP COLUMN "employeeId";
ALTER TABLE "Expense" RENAME COLUMN "newEmployeeId" TO "employeeId";
ALTER TABLE "Expense" ALTER COLUMN "employeeId" SET NOT NULL;

ALTER TABLE "Expense" ADD CONSTRAINT "Expense_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
