-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ambiguity_detector" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AmbiguityFlag" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "field" TEXT,
    "excerpt" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "question_decision_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AmbiguityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AmbiguityFlag_spec_version_id_idx" ON "AmbiguityFlag"("spec_version_id");

-- CreateIndex
CREATE INDEX "AmbiguityFlag_card_id_idx" ON "AmbiguityFlag"("card_id");
