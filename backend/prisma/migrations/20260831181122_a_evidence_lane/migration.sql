-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "conflict_detector" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "evidence_fulltext" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "source_credibility" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SourceScore" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "tier" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceFullText" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "char_count" INTEGER NOT NULL DEFAULT 0,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceFullText_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerifierPassage" (
    "id" TEXT NOT NULL,
    "verifier_run_id" TEXT NOT NULL,
    "card_source_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "char_start" INTEGER NOT NULL DEFAULT 0,
    "text" TEXT NOT NULL,
    "is_evidence" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifierPassage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardConflict" (
    "id" TEXT NOT NULL,
    "spec_version_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "other_card_id" TEXT,
    "card_source_a_id" TEXT NOT NULL,
    "card_source_b_id" TEXT NOT NULL,
    "source_a_id" TEXT NOT NULL,
    "source_b_id" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "evidence_a" TEXT NOT NULL,
    "evidence_b" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "reason" TEXT NOT NULL,
    "previous_status" TEXT NOT NULL,
    "chosen_exit" TEXT,
    "decision_id" TEXT,
    "llm_calls" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardConflict_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SourceScore_source_id_key" ON "SourceScore"("source_id");

-- CreateIndex
CREATE INDEX "SourceScore_tier_idx" ON "SourceScore"("tier");

-- CreateIndex
CREATE UNIQUE INDEX "SourceFullText_source_id_key" ON "SourceFullText"("source_id");

-- CreateIndex
CREATE INDEX "SourceFullText_status_idx" ON "SourceFullText"("status");

-- CreateIndex
CREATE INDEX "SourceFullText_expires_at_idx" ON "SourceFullText"("expires_at");

-- CreateIndex
CREATE INDEX "VerifierPassage_card_source_id_idx" ON "VerifierPassage"("card_source_id");

-- CreateIndex
CREATE INDEX "VerifierPassage_verifier_run_id_idx" ON "VerifierPassage"("verifier_run_id");

-- CreateIndex
CREATE INDEX "CardConflict_spec_version_id_idx" ON "CardConflict"("spec_version_id");

-- CreateIndex
CREATE INDEX "CardConflict_card_id_idx" ON "CardConflict"("card_id");
