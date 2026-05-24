-- AlterTable
ALTER TABLE "pathway_decisions" ADD COLUMN     "cost_breakdown" JSONB,
ADD COLUMN     "revenue_breakdown" JSONB;
