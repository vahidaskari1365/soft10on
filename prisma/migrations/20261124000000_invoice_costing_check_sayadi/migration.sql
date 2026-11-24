-- اعمال هزینه و سود: هزینهٔ جنس/دستمزد روی فاکتور + شمارهٔ صیادی چک
-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "materialCost" INTEGER NOT NULL DEFAULT 0,
                    ADD COLUMN     "laborCost" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Check" ADD COLUMN     "sayadiNo" TEXT;
