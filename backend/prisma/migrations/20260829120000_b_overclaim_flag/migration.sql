-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "overclaim_detector" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "OverclaimFlag" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "detector" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "matched_terms" JSONB NOT NULL,
    "declared_scope" JSONB NOT NULL,
    "actual_scope" JSONB NOT NULL,
    "rationale" TEXT NOT NULL,
    "suggested_narrowing" TEXT NOT NULL,
    "recommended_exit" TEXT NOT NULL,
    "chosen_exit" TEXT,
    "decision_id" TEXT,
    "llm_calls" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OverclaimFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OverclaimFlag_spec_version_id_idx" ON "OverclaimFlag"("spec_version_id");

-- CreateIndex
CREATE INDEX "OverclaimFlag_card_id_idx" ON "OverclaimFlag"("card_id");
